import neo4j from 'neo4j-driver';
import { createUserValidation } from './validation.js';
import { GraphQLError } from 'graphql';

const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'neo4JP@ssw0rd')
);

const generateId = () => {
    const timestamp = Date.now().toString();
    const randomChars = Math.random().toString(36).substring(2, 11);
    const alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < 8; i++) {
        result += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
    }

    return timestamp + randomChars + result;
};

const resolvers = {
    Query: {},
    Mutation: {
        createUser: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = createUserValidation(input);
                if (error) {
                    throw new Error(error.details[0]?.message || 'Validation failed!!');
                }

                const isEmailExist = await session.run('MATCH (u: User {email: $email}) RETURN u', { email: input.email });
                const emailRecord = isEmailExist.records[0];
                if (emailRecord) {
                    throw new Error('User with provided email already exists!!');
                }

                const isUserNameExist = await session.run('MATCH (u: User {username: $username}) RETURN u', { username: input.username });
                const userNameRecord = isUserNameExist.records[0];
                if (userNameRecord) {
                    throw new Error('User with provided username already exists!!');
                }

                const id = generateId();
                const createdAt = new Date().toISOString();

                let reqBody = { username: input.username, email: input.email, fullName: input.fullName, id, createdAt };

                const result = await session.run(`CREATE (u:User {
                    id: $id, username: $username, email: $email, fullName: $fullName, createdAt: $createdAt
                }) RETURN u`, reqBody);

                return result.records[0].get('u').properties;
            } catch (error) {
                console.error('Error creating user:', error);

                if (error instanceof GraphQLError) {
                    throw error;
                }

                if (error.code) {
                    switch (error.code) {
                        case 'Neo.ClientError.Schema.ConstraintValidationFailed':
                            throw new GraphQLError('User with this email or username already exists', {
                                extensions: {
                                    code: 'DUPLICATE_USER',
                                    originalError: error.message
                                }
                            });
                        case 'Neo.ClientError.Security.Unauthorized':
                            throw new GraphQLError('Database connection unauthorized', {
                                extensions: {
                                    code: 'DATABASE_ERROR'
                                }
                            });
                        default:
                            throw new GraphQLError(`Database error: ${error.message}`, {
                                extensions: {
                                    code: 'DATABASE_ERROR',
                                    originalError: error.message
                                }
                            });
                    }
                }

                throw new GraphQLError(`Failed to create user: ${error.message}`, {
                    extensions: {
                        code: 'INTERNAL_SERVER_ERROR',
                        originalError: error.message
                    }
                });
            } finally {
                await session.close();
            }
        }
    }
};

export default resolvers;
export { driver };
