import { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from '../config/index.js'
import { JwtPayload } from '../middleware/auth.js'

let io: SocketServer

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.APP_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string
    if (!token) return next(new Error('Missing token'))

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
      socket.data.user = payload
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload

    if (user.tenantId) {
      socket.join(`tenant:${user.tenantId}`)
    } else if (user.role === 'super_admin') {
      socket.join('super_admin')
    }

    socket.on('join_tenant', (tenantId: string) => {
      if (user.role === 'super_admin') {
        socket.join(`tenant:${tenantId}`)
      }
    })
  })

  return io
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

export function emitToTenant(tenantId: string, event: string, data: unknown): void {
  getIo().to(`tenant:${tenantId}`).emit(event, data)
}
