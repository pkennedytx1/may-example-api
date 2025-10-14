import express, { json, urlencoded } from "express"
import path from "path"
import jwt from "jsonwebtoken"
import { fileURLToPath } from "url"
import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'
import cors from 'cors'

// ------ App Initialization ------
const app = express();
const port = 8001;
const JWT_SECRET = "onionsandgarlic"

// --- Mock User Data ---
const users = [
  {
    id: 1,
    username: "alice",
    password: "123456"
  },
  {
    id: 2,
    username: "bob",
    password: "password"
  }
]

// ------ File Initialization
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ------ GraphQL Schema ------
const typeDefs = `
  type User {
    id: ID!
    username: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Query {
    me: User
    users: [User!]!
    hello: String!
  }

  type Mutation {
    login(username: String!, password: String!): AuthPayload!
  }
`

// ------ GraphQL Resolvers ------
const resolvers = {
  Query: {
    hello: () => 'Hello from GraphQL!',
    me: (parent, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated')
      }
      return users.find(user => user.id === context.user.sub)
    },
    users: (parent, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated')
      }
      return users.map(user => ({ id: user.id, username: user.username }))
    }
  },
  Mutation: {
    login: (parent, { username, password }) => {
      const user = users.find(u => u.username === username)
      if (!user) {
        throw new Error('User not found')
      }
      
      if (user.password !== password) {
        throw new Error('Invalid password')
      }

      const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
        expiresIn: "10m"
      })

      return {
        token,
        user: { id: user.id, username: user.username }
      }
    }
  }
}

// ------ Middleware ------
// --- global middleware ---
app.use(json())
app.use(urlencoded())
// --- custom middleware ---
const auth = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  if (!authHeader) return res.status(401).json({ error: "No auth header given"})

  console.log("Auth-Header:", authHeader)
  const token = authHeader.split(" ")[1]
  if (!token) return res.status(401).json({ error: "Missing token" })

  try {
    const creds = jwt.verify(token, JWT_SECRET)
    req.user = creds
    next()
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

// ------ Supporting Code ------

// ------ Route Handlers ------
// ---------> Open Routes
app.get("/", (req, res) => {
  return res.status(200).json({ message: "successfully hit the basic-api" })
})

app.post("/example-post", (req, res) => {
  console.log(req.body)
  return res.status(200).json({ message: "successfully hit the example-post" })
})

app.post("/login", (req, res) => {
  const credentials = req.body

  const user = users.find(user => user.username === credentials.username)
  if (!user) {
    return res.status(401).json({ error: "User not found" })
  }

  const isMatch = users.find(user => user.password === credentials.password)
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid password" })
  }

  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "10m"
  })

  res.json({ token })
})

// ---------> Protected Routes
app.get("/howdy", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})


// ------ Apollo Server Setup ------
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
})

// ------ Server Generation ------
async function startServer() {
  // Start Express server
  app.listen(port, () => {
    console.log(`🚀 Express server running at http://localhost:${port}`)
  })

  // Start Apollo Server on a different port
  const { url } = await startStandaloneServer(apolloServer, {
    listen: { port: 4001 },
    context: async ({ req }) => {
      const authHeader = req.headers.authorization
      if (authHeader) {
        const token = authHeader.split(' ')[1]
        try {
          const user = jwt.verify(token, JWT_SECRET)
          return { user }
        } catch (err) {
          return {}
        }
      }
      return {}
    },
  })

  console.log(`🚀 GraphQL server ready at ${url}`)
}

startServer().catch(error => {
  console.error('Error starting server:', error)
})
