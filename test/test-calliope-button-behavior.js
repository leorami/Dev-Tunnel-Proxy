/**
 * Browser console test for Calliope button behavior
 * 
 * INSTRUCTIONS:
 * 1. Open http://localhost:8080/status in your browser
 * 2. Open Developer Tools (F12) -> Console tab
 * 3. Copy and paste this script into the console
 * 4. Press Enter to run the test
 * 5. Then click a Calliope button (stethoscope icon) on any route
 * 
 * This will validate that the Calliope button now automatically runs health checks.
 */

(async function testCalliopeButtonBehavior() {
    console.log('🧪 Testing Calliope Button Behavior');
    console.log('===================================');
    
    // Check if Calliope is enabled
    const healthResp = await fetch('/api/ai/health');
    const healthData = await healthResp.json();
    console.log('🏥 Calliope enabled:', healthData.enabled);
    
    if (!healthData.enabled) {
        console.log('❌ Calliope is not enabled - this test requires OPENAI_API_KEY');
        return;
    }
    
    // Check body class
    const hasCalliopeClass = document.body.classList.contains('calliope-enabled');
    console.log('🏷️ Body calliope-enabled class:', hasCalliopeClass);
    
    // Find Calliope buttons (stethoscope icons)
    const calliopeButtons = Array.from(document.querySelectorAll('button, .icon-btn'))
        .filter(el => el.querySelector('img[src*="calliope_heart_stethoscope"]'))
        .filter(el => el.title === 'Calliope' || el.getAttribute('aria-label') === 'Calliope');
    
    console.log('🩺 Found', calliopeButtons.length, 'Calliope buttons');
    
    if (calliopeButtons.length === 0) {
        console.log('❌ No Calliope buttons found - check that buttons have correct title/aria-label');
        return;
    }
    
    // Test each button's route data
    calliopeButtons.forEach((btn, i) => {
        const route = btn.dataset.route || btn.closest('[data-route]')?.dataset?.route;
        console.log(`   Button ${i+1}: route="${route}" title="${btn.title}"`);
        
        if (!route) {
            console.log(`   ⚠️ Button ${i+1} has no route data attribute`);
        }
    });
    
    // Check if runCalliopeHealth function exists
    if (typeof runCalliopeHealth === 'function') {
        console.log('✅ runCalliopeHealth function exists');
    } else {
        console.log('❌ runCalliopeHealth function not found');
        return;
    }
    
    // Check if ensureAiOpen function exists
    if (typeof ensureAiOpen === 'function') {
        console.log('✅ ensureAiOpen function exists');
    } else {
        console.log('❌ ensureAiOpen function not found');
    }
    
    // Monitor console for the next 30 seconds to catch runCalliopeHealth calls
    console.log('\n📝 INSTRUCTIONS:');
    console.log('================');
    console.log('Now click any Calliope button (stethoscope icon) on a route.');
    console.log('Watch for:');
    console.log('  1. AI drawer should open automatically');
    console.log('  2. A message "Heya! One sec while I listen to [route]..." should appear');
    console.log('  3. Thinking animation should show');
    console.log('  4. Health check results should appear in Calliope\'s voice');
    console.log('\nWatching for 30 seconds...');
    
    // Override runCalliopeHealth to detect calls
    const originalRunCalliopeHealth = window.runCalliopeHealth;
    let callCount = 0;
    
    window.runCalliopeHealth = function(routeKey) {
        callCount++;
        console.log(`🎯 runCalliopeHealth called with route: "${routeKey}" (call #${callCount})`);
        
        // Call the original function
        return originalRunCalliopeHealth.call(this, routeKey);
    };
    
    // Set a timeout to restore the original function and show results
    setTimeout(() => {
        window.runCalliopeHealth = originalRunCalliopeHealth;
        
        if (callCount > 0) {
            console.log(`\n🎉 SUCCESS! runCalliopeHealth was called ${callCount} time(s)`);
            console.log('✅ Calliope button behavior is working correctly');
        } else {
            console.log('\n⚠️ No runCalliopeHealth calls detected');
            console.log('This could mean:');
            console.log('  1. No button was clicked');
            console.log('  2. Button click handler is not calling runCalliopeHealth');
            console.log('  3. Button does not have route data attribute');
        }
    }, 30000);
    
})();
