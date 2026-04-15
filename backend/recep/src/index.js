import 'dotenv/config';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './typeDefs.js';
import { resolvers } from './resolvers.js';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';

const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs: gql(typeDefs), resolvers }]),
});

const port = process.env.PORT || 5003;

startStandaloneServer(server, {
    listen: { port: port, host: '0.0.0.0' },
    context: async ({ req }) => {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'];
        return { userId, userRole, userEmail };
    }
}).then(({ url }) => {
    console.log(`🚀 Receptionist Apollo Server ready at: ${url}`);
});
