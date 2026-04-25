import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, Page } from 'playwright'
import { Reservation } from './supabase'

// Enable stealth plugin
chromium.use(StealthPlugin())

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function scrapeReservations(
  loginId: string,
  password: string,
  hpbSalonId: string
): Promise<Reservation[]> {
  // Random jitter: 0-30 seconds
  const jitter = Math.random() * 30_000
  await sleep(jitter)

  let browser: Browser | null = null
  try {
    // Launch browser with stealth mode for anti-detection
    console.log(`[${hpbSalonId}] Launching browser...`)
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-popup-blocking',
        '--disable-extensions',
      ],
    })

    console.log(`[${hpbSalonId}] Creating page with headers...`)
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
    })
    const page = await context.newPage()

    // Navigate to SALON BOARD login with extended timeout
    console.log(`[${hpbSalonId}] Navigating to login page (timeout: 120s)...`)
    try {
      await page.goto('https://salonboard.com/login/', {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      })
      console.log(`[${hpbSalonId}] ✓ Login page loaded`)
    } catch (navError) {
      const errorMsg = navError instanceof Error ? navError.message : String(navError)
      console.error(`[${hpbSalonId}] ✗ Navigation error: ${errorMsg}`)
      console.log(`[${hpbSalonId}] Attempting load state: ${page.url()}`)
      throw navError
    }

    // Wait for login form with better error handling
    console.log(`[${hpbSalonId}] Waiting for login form...`)
    try {
      await page.waitForSelector('input[id*="uid"], input[name*="id"], input[placeholder*="ID"]', { timeout: 15000 })
      console.log(`[${hpbSalonId}] ✓ Login form found`)
    } catch (formError) {
      console.error(`[${hpbSalonId}] ✗ Login form not found after 15s`)
      const pageContent = await page.content()
      console.log(`[${hpbSalonId}] Page length: ${pageContent.length}`)
      throw new Error('Login form fields not found on page')
    }

    // Try multiple selectors for login form
    const loginIdInput = await page.$('input[id*="uid"]') ||
                         await page.$('input[name="uid"]') ||
                         await page.$('input[placeholder*="ID"]')

    const passwordInput = await page.$('input[type="password"]')

    if (!loginIdInput || !passwordInput) {
      throw new Error('Login form fields not found')
    }

    // Fill login credentials with human-like typing
    console.log(`[${hpbSalonId}] Filling login credentials...`)
    await loginIdInput.click()
    for (const char of loginId) {
      await page.keyboard.type(char, { delay: 80 + Math.random() * 120 })
    }
    await sleep(500 + Math.random() * 1000)
    await passwordInput.click()
    for (const char of password) {
      await page.keyboard.type(char, { delay: 80 + Math.random() * 120 })
    }
    await sleep(800 + Math.random() * 1200)

    // Submit login form
    const submitBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]')
    if (!submitBtn) {
      throw new Error('Submit button not found')
    }

    console.log(`[${hpbSalonId}] Submitting login...`)
    await page.mouse.move(
      400 + Math.random() * 600,
      300 + Math.random() * 300,
      { steps: 15 }
    )
    await sleep(800 + Math.random() * 1500)
    await submitBtn.click()

    // Wait for post-login navigation
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })

    // Check for login error
    const errorMsg = await page.$('.error, .alert-danger, [role="alert"]')
    if (errorMsg) {
      const errorText = await errorMsg.textContent()
      throw new Error(`Login failed: ${errorText}`)
    }

    // Navigate to reservation list
    // TODO: Adjust URL/path based on actual SALON BOARD interface
    console.log(`[${hpbSalonId}] Navigating to reservation list...`)
    await page.goto(`https://salonboard.com/yoyaku/list.php?shop_id=${hpbSalonId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })

    // Extract reservations
    console.log(`[${hpbSalonId}] Extracting reservations...`)
    const reservations = await extractReservations(page, hpbSalonId)

    return reservations
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Scraping failed for salon ${hpbSalonId}: ${message}`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function extractReservations(page: Page, hpbSalonId: string): Promise<Reservation[]> {
  // This is a placeholder implementation
  // Actual selectors depend on SALON BOARD HTML structure
  const reservations: Reservation[] = []

  try {
    // Wait for table or list elements
    await page.waitForSelector('table, [role="table"], .reservation-item', { timeout: 5000 }).catch(() => {
      console.log(`[${hpbSalonId}] Reservation table not found, returning empty list`)
      return null
    })

    // Extract reservation rows (adjust selectors based on actual HTML)
    const rows = await page.$$('table tbody tr, [role="row"], .reservation-item')

    for (const row of rows) {
      try {
        // Extract data from row (adjust selectors based on actual HTML)
        const resIdEl = await row.$('td:nth-child(1), [data-id]')
        const nameEl = await row.$('td:nth-child(2), [data-name]')
        const menuEl = await row.$('td:nth-child(3), [data-menu]')
        const startEl = await row.$('td:nth-child(4), [data-start]')
        const endEl = await row.$('td:nth-child(5), [data-end]')

        if (resIdEl && nameEl && startEl) {
          const reservation: Reservation = {
            hpb_reservation_id: (await resIdEl.textContent())?.trim() || '',
            customer_name: (await nameEl.textContent())?.trim() || '',
            menu_name: (await menuEl?.textContent())?.trim() || '',
            start_time: (await startEl.textContent())?.trim() || '',
            end_time: (await endEl?.textContent())?.trim() || '',
            status: 'confirmed',
            raw_data: { source: 'salon_board', extracted_at: new Date().toISOString() },
          }

          if (reservation.hpb_reservation_id) {
            reservations.push(reservation)
          }
        }
      } catch (rowError) {
        console.warn(`[${hpbSalonId}] Failed to extract row:`, rowError)
        continue
      }
    }

    console.log(`[${hpbSalonId}] Extracted ${reservations.length} reservations`)
    return reservations
  } catch (error) {
    console.warn(`[${hpbSalonId}] Error extracting reservations:`, error)
    return reservations
  }
}
