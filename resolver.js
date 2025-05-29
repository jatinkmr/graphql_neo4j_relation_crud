import neo4j from 'neo4j-driver';
import { createUserValidation, fetchList, postCreationValidation, updateUserValidation } from './validation.js';
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
        // user's operations
        getAllUsers: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = fetchList(input);
                if (error)
                    throw new Error(error.details[0]?.message || 'Validation failed!!');

                let limit = input.pageSize;
                let page = input.pageNumber;
                let offset = (page - 1) * limit;

                const result = await session.run(
                    `MATCH (u:User) RETURN u ORDER BY u.createdAt DESC SKIP $offset LIMIT $limit`,
                    { limit: neo4j.int(limit), offset: neo4j.int(offset) }
                );

                if (!result?.records?.length)
                    return [];

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

                const result = await session.run(
                    `MATCH (u: User {id: $id}) OPTIONAL MATCH (u)-[:AUTHORED]->(p:Post) RETURN u, collect(p) as posts`,
                    { id }
                );

                if (!result.records?.length) return null;

                const userNode = record.get('u').properties;
                const posts = record.get('posts').map(post => post.properties);

                return {
                    id: userNode?.id,
                    username: userNode?.username,
                    email: userNode?.email,
                    fullName: userNode?.fullName,
                    createdAt: userNode?.createdAt,
                    posts: posts || []
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
            } finally {
                await session.close();
            }
        },
        // post's operations
        fetchAllPosts: async (_, { input }) => {
            const session = driver.session();
            try {
                const { error } = fetchList(input);
                if (error)
                    throw new Error(error.details[0]?.message || 'Validation failed!!');

                let limit = input.pageSize;
                let page = input.pageNumber;
                let offset = (page - 1) * limit;

                const result = await session.run(
                    `MATCH (u: User)-[:AUTHORED]->(p:Post) RETURN p,u ORDER BY p.createdAt DESC SKIP $offset LIMIT $limit`,
                    { limit: neo4j.int(limit), offset: neo4j.int(offset) }
                );

                if (!result?.records?.length)
                    return [];

                const posts = [];
                result.records.forEach(record => {
                    const post = record.get('p').properties;
                    const user = record.get('u').properties;
                    posts.push({ ...post, author: user });
                });
                return posts
            } catch (error) {
                console.log('facing error while fetching post list -> ', error.message);
                throw new Error(error.message);
            } finally {
                await session.close();
            }
        },
        fetchPostInfo: async (_, { id }) => {
            const session = driver.session();
            try {
                if (!id) {
                    throw new GraphQLError('Post id is missing!!', { extensions: { code: 'BAD_USER_INPUT' } });
                }

                const result = await session.run(
                    `MATCH (u: User)-[:AUTHORED]->(p:Post {id: $id}) RETURN p, u`,
                    { id }
                );

                if (!result?.records?.length) return null;

                const post = result.records[0].get('p').properties;
                const author = result.records[0].get('u').properties;

                return {
                    id: post.id,
                    title: post.title,
                    content: post.content,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt || post.createdAt,
                    author: {
                        id: author.id,
                        username: author.username,
                        email: author.email,
                        fullName: author.fullName || '',
                        createdAt: author.createdAt
                    }
                };
            } catch (error) {
                console.log('Error facing while fetching post info -> ', error.message);

                if (error instanceof GraphQLError) {
                    throw error;
                }

                throw new GraphQLError(`Failed to fetch post: ${error.message}`, {
                    extensions: {
                        code: 'INTERNAL_SERVER_ERROR',
                        originalError: error.message
                    }
                });
            } finally {
                await session.close();
            }
        },
        postsByUser: async (_, { userId }) => {
            let session = driver.session();
            try {
                if (!userId)
                    throw new GraphQLError('userId is missing!!', { extensions: { code: 'BAD_USER_INPUT' } });

                const result = await session.run(
                    'MATCH (u:User {id: $userId})-[:AUTHORED]->(p:Post) RETURN p, u ORDER BY p.createdAt DESC',
                    { userId }
                );
                if (!result.records?.length) return [];

                const posts = [];
                result.records.forEach(record => {
                    const post = record.get('p').properties;
                    const user = record.get('u').properties;
                    posts.push({ ...post, author: user });
                });
                return posts;
            } catch (error) {
                console.log('Error facing while fetching post info by user -> ', error.message);

                if (error instanceof GraphQLError) {
                    throw error;
                }

                throw new GraphQLError(`Failed to fetch post: ${error.message}`, {
                    extensions: {
                        code: 'INTERNAL_SERVER_ERROR',
                        originalError: error.message
                    }
                });
            } finally {
                await session.close();
            }
        }
    },
    Mutation: {
        // user's operations
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
        updateUser: async (_, { id, input }) => {
            const session = driver.session();
            try {
                const { error } = updateUserValidation(input)
                if (error)
                    throw new GraphQLError(error.details[0]?.message || 'Validation failed!!', { extensions: { code: 'VALIDATION_ERROR' } });

                if (!Object.keys(input)?.length) {
                    throw new GraphQLError('No fields to update', {
                        extensions: { code: 'VALIDATION_ERROR' }
                    });
                }

                const setClause = Object.keys(input)
                    .map(key => `u.${key} = $${key}`)
                    .join(', ');

                if (!setClause) {
                    throw new GraphQLError('No fields to update', {
                        extensions: { code: 'VALIDATION_ERROR' }
                    });
                }

                const parameters = { id, ...input };

                const cypher = `MATCH (u:User {id: $id}) SET ${setClause} RETURN u`;

                const result = await session.run(cypher, parameters);

                if (result.records.length === 0) {
                    throw new GraphQLError('User not found', {
                        extensions: { code: 'NOT_FOUND' }
                    });
                }

                const userResult = await session.run('MATCH (u: User {id: $id}) RETURN u', { id });

                let userNode = userResult.records[0].get('u').properties;

                let response = {
                    id: userNode?.id, username: userNode?.username,
                    email: userNode?.email, fullName: userNode?.fullName, createdAt: userNode?.createdAt
                };

                return response;
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
        },
        deleteUser: async (_, { id }) => {
            const session = driver.session();
            try {
                if (!id) {
                    throw new GraphQLError('User ID is required for deletion', {
                        extensions: {
                            code: 'BAD_USER_INPUT'
                        }
                    });
                }

                const userExistResult = await session.run('MATCH (u:User {id: $id}) RETURN u', { id });
                if (userExistResult.records.length === 0) {
                    throw new GraphQLError("User with provided ID doesn't exist!", {
                        extensions: {
                            code: 'USER_NOT_FOUND'
                        }
                    });
                }

                await session.run(`MATCH (u:User {id: $id}) DETACH DELETE u RETURN count(u) as deletedCount`, { id });
                return true;
            } catch (error) {
                console.log('Error while updating the user ->', error)

                if (error instanceof GraphQLError)
                    throw error;

                if (error.code) {
                    switch (error.code) {
                        case 'Neo.ClientError.Security.Unauthorized':
                            throw new GraphQLError('Database connection unauthorized', {
                                extensions: {
                                    code: 'DATABASE_ERROR'
                                }
                            });
                        case 'Neo.ClientError.Statement.SyntaxError':
                            throw new GraphQLError('Invalid query syntax', {
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
        // post's operations
        createPost: async (_, { input }) => {
            let session = driver.session();
            try {
                const { error } = postCreationValidation(input);
                if (error)
                    throw new GraphQLError(error.details[0]?.message || 'Validation failed!!', { extensions: { code: 'VALIDATION_ERROR' } });

                const isUserExist = await session.run('MATCH (u: User {id: $id}) RETURN u', { id: input.authorId });
                if (!isUserExist.records[0])
                    throw new GraphQLError('Author not found!!', { extensions: { code: 'USER_NOT_FOUND' } });

                const id = generateId();
                const createdAt = new Date().toISOString();

                let reqBody = { title: input.title, content: input.content, createdAt, authorId: input.authorId, id };

                const result = await session.run(`MATCH (u: User { id: $authorId }) CREATE (p: Post { id: $id, title: $title, content: $content, createdAt: $createdAt, updatedAt: $createdAt }) CREATE (u)-[:AUTHORED]->(p) RETURN p`, reqBody);

                if (!result?.records?.length)
                    throw new GraphQLError('Post creation failed!!', { extensions: { code: 'POST_CREATION_FAILED' } })

                return result.records[0].get('p').properties;
            } catch (error) {
                console.error('Error creating user:', error);

                if (error instanceof GraphQLError)
                    throw error;

                if (error.code) {
                    switch (error.code) {
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
