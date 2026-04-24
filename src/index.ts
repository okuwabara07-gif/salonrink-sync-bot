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

async function main() {
  console.log('🚀 SALON BOARD Sync Bot started')

  try {
    // Random jitter: 0-30 seconds
    const jitterMs = Math.random() * 30_000
    console.log(`⏳ Jitter: ${Math.round(jitterMs)}ms`)
    await sleep(jitterMs)

    // Get all salon credentials
    console.log('📋 Fetching salon credentials...')
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
        console.error(`❌ Sync failed for salon ${salonId}: ${errorMsg}`)

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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('💥 Fatal error:', errorMsg)
    process.exit(1)
  }
}

// Run the bot
main().catch(error => {
  console.error('Uncaught error:', error)
  process.exit(1)
})
