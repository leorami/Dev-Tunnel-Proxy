/**
 * Quick browser console test for Calliope enable/disable logic
 * 
 * INSTRUCTIONS:
 * 1. Open http://localhost:8080/status in your browser
 * 2. Open Developer Tools (F12) -> Console tab
 * 3. Copy and paste this entire script into the console
 * 4. Press Enter to run the test
 * 
 * This will validate that the Calliope enable/disable logic is working correctly.
 */

(async function quickCalliopeTest() {
    console.log('🧪 Quick Calliope Enable/Disable Test');
    console.log('====================================');
    
    try {
        // Check API health
        const healthResp = await fetch('/api/ai/health');
        const healthData = await healthResp.json();
        console.log('📊 API Health:', healthData);
        
        // Check body class
        const hasCalliopeClass = document.body.classList.contains('calliope-enabled');
        console.log('🏷️ Body has calliope-enabled class:', hasCalliopeClass);
        
        // Validate class matches API state
        const classMatchesAPI = hasCalliopeClass === healthData.enabled;
        console.log(classMatchesAPI ? '✅ PASSED: Class matches API state' : '❌ FAILED: Class does not match API state');
        
        // Check recommend buttons
        const recButtons = Array.from(document.querySelectorAll('a.btn, button.btn'))
            .filter(el => /Recommend/i.test(el.textContent || ''));
        console.log('📋 Recommend buttons found:', recButtons.length);
        
        const recVisible = recButtons.filter(el => window.getComputedStyle(el).display !== 'none');
        console.log('👁️ Recommend buttons visible:', recVisible.length);
        
        // Expected: visible when Calliope is DISABLED, hidden when ENABLED
        const recExpectedVisible = !healthData.enabled;
        const recCorrect = (recVisible.length > 0) === recExpectedVisible;
        console.log(recCorrect ? '✅ PASSED: Recommend buttons visibility correct' : '❌ FAILED: Recommend buttons visibility incorrect');
        
        // Check diagnose buttons
        const diagButtons = Array.from(document.querySelectorAll('button, .icon-btn'))
            .filter(el => el.querySelector('img[src*="calliope_heart_stethoscope"]'));
        console.log('🩺 Diagnose buttons found:', diagButtons.length);
        
        if (diagButtons.length > 0) {
            const expectedLabel = healthData.enabled ? 'Calliope' : 'Diagnose';
            const correctLabels = diagButtons.filter(el => 
                el.title === expectedLabel || el.getAttribute('aria-label') === expectedLabel
            ).length;
            
            console.log('🏷️ Expected button label:', expectedLabel);
            console.log('✅ Buttons with correct label:', correctLabels, '/', diagButtons.length);
            
            const labelsCorrect = correctLabels === diagButtons.length;
            console.log(labelsCorrect ? '✅ PASSED: Diagnose button labels correct' : '❌ FAILED: Diagnose button labels incorrect');
        }
        
        // Test button click behavior (if enabled)
        if (healthData.enabled && diagButtons.length > 0) {
            console.log('🖱️ Testing Calliope button click...');
            const drawer = document.getElementById('aiDrawer');
            if (drawer) {
                const wasCollapsed = drawer.classList.contains('collapsed');
                diagButtons[0].click();
                
                setTimeout(() => {
                    const nowCollapsed = drawer.classList.contains('collapsed');
                    const drawerOpened = wasCollapsed && !nowCollapsed;
                    console.log(drawerOpened ? '✅ PASSED: Calliope button opens drawer' : '❌ FAILED: Calliope button should open drawer');
                }, 300);
            } else {
                console.log('⚠️ Calliope drawer not found');
            }
        }
        
        // Summary
        console.log('\n📊 SUMMARY:');
        console.log('===========');
        console.log('API Enabled:', healthData.enabled);
        console.log('UI Class Set:', hasCalliopeClass);
        console.log('Recommend Buttons:', recExpectedVisible ? 'should be visible' : 'should be hidden', '→', recVisible.length > 0 ? 'visible' : 'hidden');
        console.log('Diagnose Labels:', diagButtons.length > 0 ? (healthData.enabled ? 'Calliope' : 'Diagnose') : 'none found');
        
        const allPassed = classMatchesAPI && recCorrect;
        console.log('\n' + (allPassed ? '🎉 ALL TESTS PASSED!' : '❌ Some tests failed - check above'));
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
})();

console.log('\n💡 TIP: To test the opposite state, you can:');
console.log('1. Check current docker-compose.yml for OPENAI_API_KEY');
console.log('2. Temporarily remove/add the API key and restart: docker-compose up -d conflict-api');
console.log('3. Refresh this page and run the test again');
