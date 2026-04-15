import express from 'express';
import cors from 'cors';
import proxy from 'express-http-proxy';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import cookieParser from 'cookie-parser';
import { verifyAccessToken } from './tokenUtils.js';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const COOKIE_DOMAIN = isProd ? '.yourdomain.com' : '.myapp.local';

const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: COOKIE_DOMAIN,
    path: '/',
};

/**
 * Clears auth cookies with ALL possible scope variants.
 * (Moved from Auth Service to Gateway)
 */
const nukeCookies = (res) => {
    const names = ['accessToken', 'refreshToken'];
    const variants = [
        { ...cookieOptions },
        { httpOnly: true, sameSite: 'lax', path: '/' },
        { httpOnly: true, sameSite: 'none', secure: true, path: '/', domain: COOKIE_DOMAIN },
        { httpOnly: true, sameSite: 'none', secure: true, path: '/' },
        { httpOnly: true, sameSite: 'strict', path: '/', domain: COOKIE_DOMAIN },
        { httpOnly: true, sameSite: 'strict', path: '/' },
    ];
    for (const name of names) {
        for (const opts of variants) {
            res.clearCookie(name, { ...opts, maxAge: 0 });
        }
    }
};

const app = express();

// Provide CORS configuration matching the auth standards
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://doctor.localhost:3000',
        'http://staff.localhost:3000',
        'http://doctor.myapp.local:3000',
        'http://staff.myapp.local:3000',
        'http://api.myapp.local:5000'
    ],
    credentials: true,
};
app.use(cors(corsOptions));
app.use(cookieParser());

// Middleware that extracts access tokens from headers or cookies
app.use((req, res, next) => {
    // Auth routes don't need token verification — skip entirely
    if (req.originalUrl.startsWith('/api/auth')) {
        return next();
    }

    let token = null;

    console.log(`[Gateway DEBUG] Incoming ${req.method} ${req.originalUrl}`);

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[Gateway DEBUG] Token found in Authorization header');
    }
    // 2. Check cookies via cookie-parser
    else if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
        console.log('[Gateway DEBUG] Token found in accessToken cookie');
    }

    if (token) {
        const decoded = verifyAccessToken(token);
        if (decoded) {
            console.log(`[Gateway DEBUG] Token verified. User ID: ${decoded.id}, Email: ${decoded.email}`);
            req.user = decoded; // { id, email, role, etc. }
        } else {
            console.warn('[Gateway DEBUG] Token verification failed (possibly expired or invalid key)');
        }
    } else {
        console.warn('[Gateway DEBUG] No accessToken found in req.headers.authorization or req.cookies.accessToken');
    }

    // Enforce authentication for GraphQL requests
    if (req.url === '/graphql' && !req.user) {
        console.error('[Gateway ERROR] Unauthorized access to /graphql');
        return res.status(401).json({
            errors: [{
                message: 'Unauthorized: Invalid or missing access token',
                extensions: { code: 'UNAUTHENTICATED' }
            }]
        });
    }

    next();
});

// Setup REST Proxy to Authentication Service
app.use('/api/auth', proxy('http://localhost:3001', {
    proxyReqPathResolver: (req) => '/api/auth' + req.url,
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
        try {
            const data = JSON.parse(proxyResData.toString('utf8'));

            // 1. If the response contains tokens (Login or Refresh), set cookies
            if (data.accessToken && data.refreshToken) {
                userRes.cookie('accessToken', data.accessToken, {
                    ...cookieOptions,
                    maxAge: 5 * 60 * 1000, // 5 minutes
                });
                userRes.cookie('refreshToken', data.refreshToken, {
                    ...cookieOptions,
                    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                });

                // Remove tokens from the JSON body sent to the client
                delete data.accessToken;
                delete data.refreshToken;
            }

            // 2. Clear cookies on Logout or Auth Errors (401/403)
            if (data.message === 'Logged out successfully' || proxyRes.statusCode === 401 || proxyRes.statusCode === 403) {
                console.log(`[Gateway] Clearing cookies for response status: ${proxyRes.statusCode}`);
                nukeCookies(userRes);
            }

            return JSON.stringify(data);
        } catch (e) {
            // Not JSON or parse error, return as is
            return proxyResData;
        }
    }
}));

// We need JSON parsing for GraphQL but NOT for the proxy (express-http-proxy handles the raw body)
app.use('/graphql', express.json());

// Initialize Apollo Gateway
const gateway = new ApolloGateway({
    serviceList: [
        { name: 'doctor', url: 'http://localhost:5002/graphql' },
        { name: 'recep', url: 'http://localhost:5003/graphql' },
    ],
    // Customize requests to subgraphs to include user context
    buildService({ name, url }) {
        return new RemoteGraphQLDataSource({
            url,
            willSendRequest({ request, context }) {
                // Forward the user information to the underlying subgraphs
                if (context.user) {
                    request.http.headers.set('x-user-id', String(context.user.id));
                    request.http.headers.set('x-user-role', String(context.user.role));
                    request.http.headers.set('x-user-email', String(context.user.email));
                }
            }
        });
    }
});

const startServer = async () => {
    let retries = 5;
    let server;
    while (retries) {
        try {
            server = new ApolloServer({
                gateway,
                // Optionally disable schema polling/updates
                // subscriptions: false, 
            });
            await server.start();
            break;
        } catch (err) {
            console.warn(`[Gateway INFO] Failed to connect to subgraphs, retrying in 3 seconds... (${retries} retries left)`);
            retries -= 1;
            if (retries === 0) throw err;
            await new Promise(res => setTimeout(res, 3000));
        }
    }

    // Serve GraphQL and inject the user object into the context
    app.use('/graphql', expressMiddleware(server, {
        context: async ({ req }) => {
            return { user: req.user };
        },
    }));

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Gateway Server running at http://localhost:${PORT}`);
        console.log(`📡 GraphQL endpoint: http://localhost:${PORT}/graphql`);
        console.log(`🔑 Auth Proxy endpoint: http://localhost:${PORT}/api/auth`);
    });
};

startServer().catch(err => {
    console.error('Failed to start the Gateway:', err);
});
