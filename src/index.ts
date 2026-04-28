import https from 'https'
import { execSync } from 'child_process'
import { decrypt } from './crypto'
import {
  getAllSalonCredentials,
  upsertReservations,
  updateSyncStatus,
  incrementFailureCount,
  resetFailureCount,
} from './supabase'
import { scrapeReservations } from './scraper'
import { notifyOsamu } from './notify'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runConnectivityDiagnostics(): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('🔍 Connectivity Diagnostics')
  console.log('='.repeat(60))

  return new Promise((resolve) => {
    https.get('https://salonboard.com/login/', { timeout: 10000 }, (res) => {
      console.log(`✓ SALON BOARD Status: ${res.statusCode}`)
      console.log(`  Server: ${res.headers.server || 'unknown'}`)
      console.log(`  Content-Type: ${res.headers['content-type'] || 'unknown'}`)

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
        if (data.length > 500) res.destroy()
      })
      res.on('end', () => {
        console.log(`  Body length: ${data.length} bytes`)
        resolve()
      })
    }).on('error', (err) => {
      console.error(`✗ Connection Error: ${err instanceof Error ? err.message : String(err)}`)
      resolve()
    })
  })
}

function runRuntimeDiagnostics(): void {
  if (process.env.RUN_DIAG !== 'true') {
    return
  }

  console.log('\n' + '='.repeat(60))
  console.log('🔍 Runtime Diagnostic (curl)')
  console.log('='.repeat(60))

  // Test 1: SALON BOARD
  try {
    console.log('\n=== Test 1: SALON BOARD ===')
    const sb = execSync('curl -v -m 10 https://salonboard.com/ 2>&1 | head -80', { encoding: 'utf8' })
    console.log(sb)
  } catch (e: any) {
    console.error('SALON BOARD failed:', e.message)
    if (e.stdout) console.log(e.stdout)
    if (e.stderr) console.error(e.stderr)
  }

  // Test 2: Google
  try {
    console.log('\n=== Test 2: Google ===')
    const g = execSync('curl -v -m 10 https://www.google.com/ 2>&1 | head -30', { encoding: 'utf8' })
    console.log(g)
  } catch (e: any) {
    console.error('Google failed:', e.message)
    if (e.stdout) console.log(e.stdout)
  }

  // Test 3: DNS
  try {
    console.log('\n=== Test 3: DNS ===')
    const dns = execSync('getent hosts salonboard.com 2>&1', { encoding: 'utf8' })
    console.log('salonboard.com:', dns)
    const dnsGoogle = execSync('getent hosts www.google.com 2>&1', { encoding: 'utf8' })
    console.log('www.google.com:', dnsGoogle)
  } catch (e: any) {
    console.error('DNS failed:', e.message)
  }

  console.log('\n✅ Runtime diagnostic complete')
}

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

async function main() {
  console.log('🚀 SALON BOARD Sync Bot started')
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`)
  console.log(`📦 Environment: NODE_ENV=${process.env.NODE_ENV}`)

  // TODO: Remove diagnostics after debugging
  await runConnectivityDiagnostics()
  runRuntimeDiagnostics()

  try {
    // Random jitter: 0-30 seconds
    const jitterMs = Math.random() * 30_000
    console.log(`⏳ Jitter: ${Math.round(jitterMs)}ms`)
    await sleep(jitterMs)

    // Get all salon credentials
    console.log('📋 Fetching salon credentials...')
    console.log(`🔑 SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ Set' : '❌ Missing'}`)
    console.log(`🔑 SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '✓ Set' : '❌ Missing'}`)
    console.log(`🔑 ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? '✓ Set' : '❌ Missing'}`)

    const salons = await getAllSalonCredentials()
    console.log(`✓ Found ${salons.length} salon(s)`)

    if (salons.length === 0) {
      console.log('⚠️ No salons configured')
      return
    }

    // Process each salon
    for (const salon of salons) {
      const salonId = salon.salon_id
      const hpbSalonId = salon.hpb_salon_id

      console.log(`\n🏢 Processing salon: ${hpbSalonId} (${salonId})`)

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
        await upsertReservations(salonId, reservations)
        console.log('✓ Reservations saved')

        // Update sync status to healthy
        console.log('✅ Updating sync status to healthy...')
        await updateSyncStatus(salonId, 'healthy')
        await resetFailureCount(salonId)
        console.log('✓ Sync status updated')

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const errorStack = err instanceof Error ? err.stack : 'No stack trace'
        console.error(`❌ Sync failed for salon ${salonId}: ${errorMsg}`)
        console.error(`📍 Stack: ${errorStack}`)

        try {
          // Increment failure count
          const status = await incrementFailureCount(salonId)
          console.log(`⚠️ Failure count: ${status.consecutive_failures}`)

          if (status.consecutive_failures >= 3) {
            // Set to unhealthy and notify
            console.log('🚨 Marking salon as unhealthy and notifying...')
            await updateSyncStatus(salonId, 'unhealthy', errorMsg)

            const notificationMessage = `🚨 SALON BOARD同期が3回連続失敗しました\n\nサロンID: ${salonId}\nHPB ID: ${hpbSalonId}\nエラー: ${errorMsg}`
            await notifyOsamu(notificationMessage)
            console.log('✓ Notification sent to Osamu')
          } else {
            // Keep status as healthy but log the error
            await updateSyncStatus(salonId, 'healthy', errorMsg)
          }
        } catch (statusErr) {
          console.error(`❌ Failed to update sync status: ${statusErr}`)
        }
      }
    }

    console.log('\n✨ Sync bot completed successfully')
    process.exit(0)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : 'No stack trace'
    console.error('💥 Fatal error:', errorMsg)
    console.error('📍 Stack:', errorStack)
    console.error('⏰ Failed at:', new Date().toISOString())
    process.exit(1)
  }
}

// Run the bot
main().catch(error => {
  const errorMsg = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : 'No stack trace'
  console.error('❌ Main function error:', errorMsg)
  console.error('📍 Stack:', errorStack)
  process.exit(1)
})
