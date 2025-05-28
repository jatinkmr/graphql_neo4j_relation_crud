import neo4j from 'neo4j-driver';
import { createUserValidation, fetchUserList, updateUserValidation } from './validation.js';
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
    Query: {
        getAllUsers: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = fetchUserList(input);
                if (error)
                    throw new Error(error.details[0]?.message || 'Validation failed!!');

                let limit = input.pageSize;
                let page = input.pageNumber;
                let offset = (page - 1) * limit;

                const result = await session.run(
                    `MATCH (u:User) RETURN u ORDER BY u.createdAt DESC SKIP $offset LIMIT $limit`,
                    { limit: neo4j.int(limit), offset: neo4j.int(offset) }
                );

                // let response = result.records.map(record => record.get('u').properties);
                let response = result.records.map(record => {
                    const properties = record.get('u').properties;
                    return new Proxy(properties, {
                        get: (target, prop) => {
                            return prop in target ? target[prop] : '';
                        }
                    });
                });

                return response;
            } catch (error) {
                console.log('error while fetching allUsers -> ', error.message);
                throw new Error(error.message);
            } finally {
                await session.close();
            }
        },
        fetchUserInfo: async (_, { id }) => {
            const session = driver.session();
            try {
                if (!id)
                    throw new Error('UserId not available');

                const result = await session.run('MATCH (u: User {id: $id}) RETURN u', { id });
                session.close();

                const record = result.records[0];
                if (!record) return null;

                const userNode = record.get('u').properties;

                return {
                    id: userNode?.id, username: userNode?.username,
                    email: userNode?.email, fullName: userNode?.fullName, createdAt: userNode?.createdAt
                }
            } catch (error) {
                console.log(`error while fetching userInfo -> ${error.message}`);
                throw new Error(error.message);
            } finally {
                await session.close();
            }
        },
        searchUsers: async (_, { query }) => {
            const session = driver.session();
            try {
                if (!query)
                    throw new Error('Query string cannot be empty!!');

                const result = await session.run(`MATCH (u:User) WHERE u.username CONTAINS $query OR u.fullName CONTAINS $query RETURN u ORDER BY u.username`, { query });

                if (!result.records[0].length) return null;

                let response = result.records.map(record => {
                    const properties = record.get('u').properties;
                    return new Proxy(properties, {
                        get: (target, prop) => {
                            return prop in target ? target[prop] : '';
                        }
                    });
                });

                return response;
            } catch (error) {
                console.log(`error while searching the user -> ${error.message}`);
                throw new Error(error.message);
            } finally { }
        }
    },
    Mutation: {
        createUser: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = createUserValidation(input);
                if (error)
                    throw new Error(error.details[0]?.message || 'Validation failed!!');

                const isEmailExist = await session.run('MATCH (u: User {email: $email}) RETURN u', { email: input.email });
                const emailRecord = isEmailExist.records[0];
                if (emailRecord)
                    throw new Error('User with provided email already exists!!');

                const isUserNameExist = await session.run('MATCH (u: User {username: $username}) RETURN u', { username: input.username });
                const userNameRecord = isUserNameExist.records[0];
                if (userNameRecord)
                    throw new Error('User with provided username already exists!!');

                const id = generateId();
                const createdAt = new Date().toISOString();

                let reqBody = { username: input.username, email: input.email, fullName: input.fullName, id, createdAt };

                const result = await session.run(`CREATE (u:User {
                    id: $id, username: $username, email: $email, fullName: $fullName, createdAt: $createdAt
                }) RETURN u`, reqBody);

                return result.records[0].get('u').properties;
            } catch (error) {
                console.error('Error creating user:', error);

                if (error instanceof GraphQLError)
                    throw error;

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
        },
        updateUser: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = updateUserValidation(input)
                if (error)
                    throw new Error(error.details[0]?.message || 'Validation failed!!');

                const setClause = Object.keys(input).map(key => `u.${key} = $${key}`).join(', ');

                if (!setClause) throw new Error('No fields to update');

                const result = await session.run(`MATCH (u:User {id: $id}) SET ${setClause} RETURN u`, { id, ...input });

                if (result.records.length === 0) {
                    throw new Error('User not found');
                }

                return result.records[0].get('u').properties;
            } catch (error) {
                console.log('Error while updating the user ->', error)

                if (error instanceof GraphQLError)
                    throw error;

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
