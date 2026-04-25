import { execSync } from 'child_process'

console.log('🚀 Railway Curl Diagnostic Test')
console.log('='.repeat(60))
console.log(`⏰ Time: ${new Date().toISOString()}`)

// Test 1: SALON BOARD
console.log('\n' + '='.repeat(60))
console.log('📡 Test 1: SALON BOARD (https://salonboard.com/)')
console.log('='.repeat(60))

try {
  console.log('\n$ curl -v -m 10 https://salonboard.com/ (first 50 lines)\n')
  const salonboardResult = execSync('curl -v -m 10 https://salonboard.com/ 2>&1', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: 'pipe',
  })
  const salonboardLines = salonboardResult.split('\n').slice(0, 50)
  console.log(salonboardLines.join('\n'))
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`✗ Error: ${errorMsg}`)
}

// Test 2: Google (connectivity baseline)
console.log('\n' + '='.repeat(60))
console.log('📡 Test 2: Google (https://www.google.com/ - Baseline)')
console.log('='.repeat(60))

try {
  console.log('\n$ curl -v -m 10 https://www.google.com/ (first 20 lines)\n')
  const googleResult = execSync('curl -v -m 10 https://www.google.com/ 2>&1', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: 'pipe',
  })
  const googleLines = googleResult.split('\n').slice(0, 20)
  console.log(googleLines.join('\n'))
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`✗ Error: ${errorMsg}`)
}

// Test 3: DNS resolution
console.log('\n' + '='.repeat(60))
console.log('🌐 Test 3: DNS Resolution')
console.log('='.repeat(60))

try {
  console.log('\nResolving salonboard.com...')
  const dnsResult = execSync('getent hosts salonboard.com 2>&1 || nslookup salonboard.com', {
    encoding: 'utf-8',
    timeout: 5000,
    stdio: 'pipe',
  })
  console.log(dnsResult)
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`✗ Error: ${errorMsg}`)
}

console.log('\n' + '='.repeat(60))
console.log('✅ Diagnostic complete')
console.log('='.repeat(60))
