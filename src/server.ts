import express, { Request, Response, NextFunction } from 'express'
import { decrypt } from './crypto'
import {
  getAllSalonCredentials,
  upsertReservations,
  updateSyncStatus,
  getSyncStatus,
} from './supabase'
import { scrapeReservations } from './scraper'

const app = express()
const PORT = parseInt(process.env.PORT || '80', 10)
const SYNC_API_KEY = process.env.SYNC_API_KEY || 'default-sync-key'

app.use(express.json())

// Middleware: API Key validation
const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7) // Remove "Bearer " prefix
  if (token !== SYNC_API_KEY) {
    res.status(401).json({ error: 'Invalid API key' })
    return
  }

  next()
}

// Health check endpoint (no auth required)
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Sync endpoint: Triggered by Vercel /api/hpb/sync
app.post('/sync', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { salon_id } = req.body

    // Validate salon_id
    if (!salon_id || typeof salon_id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid salon_id' })
    }

    console.log(`📨 Sync request received for salon_id: ${salon_id}`)

    // Get salon credentials from Supabase
    const allCredentials = await getAllSalonCredentials()
    const salon = allCredentials.find(s => s.salon_id === salon_id)
    if (!salon) {
      return res.status(404).json({ error: 'Salon not found or credentials not configured' })
    }

    const hpbSalonId = salon.hpb_salon_id
    console.log(`🏢 Processing salon: ${hpbSalonId} (${salon_id})`)

    try {
      // Decrypt credentials
      console.log('🔓 Decrypting credentials...')
      const loginId = decrypt(salon.hpb_login_id_enc)
      const password = decrypt(salon.hpb_password_enc)

      // Scrape reservations
      console.log('🕷️  Scraping SALON BOARD...')
      const reservations = await scrapeReservations(loginId, password, hpbSalonId)
      console.log(`✓ Found ${reservations.length} reservation(s)`)

      // Upsert to Supabase
      console.log('💾 Upserting to Supabase...')
      await upsertReservations(salon_id, reservations)
      console.log('✓ Reservations saved')

      // Update sync status to healthy
      console.log('✅ Updating sync status to healthy...')
      await updateSyncStatus(salon_id, 'healthy')
      console.log('✓ Sync status updated')

      res.json({
        success: true,
        salon_id,
        hpb_salon_id: hpbSalonId,
        reservations_count: reservations.length,
        synced_at: new Date().toISOString(),
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const errorStack = err instanceof Error ? err.stack : 'No stack trace'
      console.error(`❌ Sync failed for salon ${salon_id}: ${errorMsg}`)
      console.error(`📍 Stack: ${errorStack}`)

      try {
        // Get current sync status
        const currentStatus = await getSyncStatus(salon_id)
        const failureCount = (currentStatus?.consecutive_failures || 0) + 1
        console.log(`⚠️ Failure count: ${failureCount}`)

        if (failureCount >= 3) {
          // Set to unhealthy
          console.log('🚨 Marking salon as unhealthy...')
          await updateSyncStatus(salon_id, 'unhealthy', errorMsg)
        } else {
          // Keep status as healthy but log the error
          await updateSyncStatus(salon_id, 'healthy', errorMsg)
        }
      } catch (statusErr) {
        console.error(`❌ Failed to update sync status: ${statusErr}`)
      }

      res.status(500).json({
        success: false,
        salon_id,
        error: errorMsg,
        synced_at: new Date().toISOString(),
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : 'No stack trace'
    console.error('💥 Fatal error in /sync endpoint:', errorMsg)
    console.error('📍 Stack:', errorStack)

    res.status(500).json({
      error: 'Internal server error',
      details: errorMsg,
      timestamp: new Date().toISOString(),
    })
  }
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Express error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err instanceof Error ? err.message : String(err),
  })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SalonRink Sync Server listening on port ${PORT}`)
  console.log(`📨 POST /sync endpoint ready`)
  console.log(`🔐 API Key required: Bearer ${SYNC_API_KEY ? '***' : 'NOT SET'}`)
  console.log(`⏰ Started at ${new Date().toISOString()}`)
})

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error)
  console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise)
  console.error('Reason:', reason)
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack)
  }
  process.exit(1)
})
