import 'dotenv/config';
console.log('[DEBUG] CWD:', process.cwd());
console.log('[DEBUG] DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'UNDEFINED');
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './typeDefs.js';
import { resolvers } from './resolvers.js';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';

const port = process.env.PORT || 5002;

const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs: gql(typeDefs), resolvers }]),
});

const startServer = async () => {
    try {
        const { url } = await startStandaloneServer(server, {
            listen: { port: parseInt(port), host: '0.0.0.0' },
            context: async ({ req }) => {
                const userId = req.headers['x-user-id'];
                const userRole = req.headers['x-user-role'];
                const userEmail = req.headers['x-user-email'];
                return { userId, userRole, userEmail };
            }
        });

        console.log(`🚀 Doctor Apollo Server ready at: ${url}`);
    } catch (e) {
        console.error("Error starting Apollo Server", e);
    }
}

startServer();
