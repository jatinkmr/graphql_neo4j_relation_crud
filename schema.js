const typeDefs = `
    type User {
        id: String!
        username: String!
        email: String!
        fullName: String
        createdAt: String!
        posts: [Post!]
        followers: [User!]
        following: [User!]
        followerCount: Int
        followingCount: Int
    }

    type Post {
        id: String!
        title: String!
        content: String!
        createdAt: String!
        updatedAt: String!
        author: User!
        likes: [User!]!
        likeCount: Int!
        comments: [Comment!]!
    }

    type Comment {
        id: String!
        content: String!
        createdAt: String!
        author: User!
        post: Post!
    }

    input CreateUserInput {
        username: String!
        email: String!
        fullName: String
    }

    input UpdateUserInput {
        username: String
        email: String
        fullName: String
    }

    input CreatePostInput {
        title: String!
        content: String!
        authorId: ID!
    }

    input UpdatePostInput {
        title: String
        content: String
    }

    input CreateCommentInput {
        content: String!
        authorId: ID!
        postId: ID!
    }

    input FetchList {
        pageNumber: Int
        pageSize: Int
    }

    type Query {
        # User queries
        getAllUsers(input: FetchList): [User!]!
        fetchUserInfo(id: String!): User
        searchUsers(query: String!): [User!]!

        # Post queries
        fetchAllPosts(input: FetchList): [Post!]!
        fetchPostInfo(id: String!): Post
        postsByUser(userId: ID!): [Post!]!

        # Comment queries
        comments: [Comment!]!
        commentsByPost(postId: ID!): [Comment!]!
    }

    type Mutation {
        # User mutations
        createUser(input: CreateUserInput!): User!
        updateUser(id: ID!, input: UpdateUserInput!): User!
        deleteUser(id: ID!): Boolean!

        # Post mutations
        createPost(input: CreatePostInput!): Post!
        updatePost(id: ID!, input: UpdatePostInput!): Post!
        deletePost(id: ID!): Boolean!

        # Comment mutations
        createComment(input: CreateCommentInput!): Comment!
        deleteComment(id: ID!): Boolean!

        # Relationship mutations
        followUser(userId: ID!, targetUserId: ID!): Boolean!
        unfollowUser(userId: ID!, targetUserId: ID!): Boolean!
        likePost(userId: ID!, postId: ID!): Boolean!
        unlikePost(userId: ID!, postId: ID!): Boolean!
    }
`;

export default typeDefs;
