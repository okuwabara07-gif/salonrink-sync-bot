import https from 'https'

interface TestResult {
  timestamp: string
  url: string
  status: number
  statusText: string
  headers: Record<string, string>
  bodyLength: number
  bodyPreview: string
  error?: string
}

function makeRequest(url: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    console.log(`\n📡 Connecting to ${url}...`)

    https
      .get(url, { timeout: 10000 }, (res) => {
        let data = ''
        const duration = Date.now() - startTime

        console.log(`✓ Connected in ${duration}ms`)
        console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`)

        // Collect headers for logging
        const headersToLog: Record<string, string> = {}
        const importantHeaders = [
          'content-type',
          'content-length',
          'server',
          'x-powered-by',
          'set-cookie',
          'location',
          'cf-ray',
          'cf-cache-status',
          'x-frame-options',
          'x-content-type-options',
        ]

        importantHeaders.forEach((header) => {
          if (res.headers[header]) {
            headersToLog[header] = String(res.headers[header])
          }
        })

        console.log(`📋 Headers:`)
        Object.entries(headersToLog).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`)
        })

        res.on('data', (chunk) => {
          data += chunk
          if (data.length > 2000) {
            res.destroy()
          }
        })

        res.on('end', () => {
          const bodyPreview = data.substring(0, 500).replace(/\n/g, ' ')
          console.log(`📄 Body preview: ${bodyPreview}...`)

          resolve({
            timestamp: new Date().toISOString(),
            url,
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: headersToLog,
            bodyLength: data.length,
            bodyPreview,
          })
        })
      })
      .on('error', (err) => {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`✗ Error: ${errorMsg}`)

        resolve({
          timestamp: new Date().toISOString(),
          url,
          status: 0,
          statusText: 'Connection Error',
          headers: {},
          bodyLength: 0,
          bodyPreview: '',
          error: errorMsg,
        })
      })
  })
}

async function checkIPLocation(): Promise<{
  ip: string
  country: string
  region: string
}> {
  return new Promise((resolve) => {
    console.log(`\n🌍 Checking IP location...`)

    https
      .get('https://ipapi.co/json/', { timeout: 5000 }, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const ipInfo = {
              ip: json.ip || 'unknown',
              country: json.country_name || 'unknown',
              region: json.region || 'unknown',
            }
            console.log(`📍 IP: ${ipInfo.ip}`)
            console.log(`🏙️  Country: ${ipInfo.country}`)
            console.log(`🌐 Region: ${ipInfo.region}`)
            resolve(ipInfo)
          } catch (e) {
            resolve({
              ip: 'unknown',
              country: 'unknown',
              region: 'unknown',
            })
          }
        })
      })
      .on('error', (err) => {
        console.error(`✗ IP check failed: ${err instanceof Error ? err.message : String(err)}`)
        resolve({
          ip: 'unknown',
          country: 'unknown',
          region: 'unknown',
        })
      })
  })
}

async function main() {
  console.log('🚀 SALON BOARD Connectivity Test')
  console.log('='.repeat(60))
  console.log(`⏰ Time: ${new Date().toISOString()}`)
  console.log(`📦 Node: ${process.version}`)
  console.log(`💻 Platform: ${process.platform}`)

  // Check IP location first
  const ipInfo = await checkIPLocation()

  console.log('\n' + '='.repeat(60))
  console.log('🔍 Testing SALON BOARD Access')
  console.log('='.repeat(60))

  // Test 1: Basic connectivity
  const loginPageResult = await makeRequest('https://salonboard.com/login/')

  // Test 2: Check if location is detected as Japan
  console.log('\n' + '='.repeat(60))
  console.log('📊 Diagnostic Summary')
  console.log('='.repeat(60))

  const isJapan = ipInfo.country.toLowerCase().includes('japan')
  console.log(`\n✓ IP Location: ${ipInfo.country} (${isJapan ? '✓ Japan' : '✗ Not Japan'})`)
  console.log(`✓ SALON BOARD Status: ${loginPageResult.status === 200 ? '✓ Accessible' : `✗ HTTP ${loginPageResult.status}`}`)

  if (loginPageResult.error) {
    console.log(`✗ Connection Error: ${loginPageResult.error}`)
    console.log(`\n⚠️  Potential Issues:`)
    console.log(`  1. Railway us-west2 region からの接続が制限されている可能性`)
    console.log(`  2. SALON BOARD がBot検知でブロックしている可能性`)
    console.log(`  3. ファイアウォールやプロキシの問題`)
  } else if (loginPageResult.status !== 200) {
    console.log(`\n⚠️  Status Code ${loginPageResult.status}:`)
    if (loginPageResult.status === 403) {
      console.log(`  Forbidden - IP がブロックされている可能性`)
    } else if (loginPageResult.status === 429) {
      console.log(`  Too Many Requests - レート制限に達している`)
    } else if (loginPageResult.status >= 500) {
      console.log(`  Server Error - SALON BOARD がダウンしている`)
    }
  } else {
    console.log(`\n✅ All checks passed - SALON BOARD is accessible`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📝 Full Results (JSON)')
  console.log('='.repeat(60))
  console.log(
    JSON.stringify(
      {
        ipInfo,
        salonboardTest: loginPageResult,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
