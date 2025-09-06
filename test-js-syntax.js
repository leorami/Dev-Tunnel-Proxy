#!/usr/bin/env node

/**
 * JavaScript Syntax Checker for HTML Files
 * Extracts and validates JavaScript from HTML files
 */

const fs = require('fs');
const path = require('path');

function extractJavaScriptFromHTML(htmlContent) {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let match;
  
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const scriptContent = match[1];
    if (scriptContent.trim()) {
      scripts.push({
        content: scriptContent,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }
  
  return scripts;
}

function validateJavaScript(jsCode) {
  try {
    // Use Function constructor to check syntax without executing
    new Function(jsCode);
    return { valid: true };
  } catch (error) {
    // Extract more specific error information
    const lines = jsCode.split('\n');
    let lineNumber = null;
    let column = null;
    
    // Try to extract line/column info from error message
    const lineMatch = error.message.match(/(?:line\s+)?(\d+)/i);
    if (lineMatch) {
      lineNumber = parseInt(lineMatch[1]);
    }
    
    const colMatch = error.message.match(/column\s+(\d+)/i);
    if (colMatch) {
      column = parseInt(colMatch[1]);
    }
    
    return { 
      valid: false, 
      error: error.message,
      line: lineNumber,
      column: column,
      context: lineNumber && lines[lineNumber - 1] ? lines[lineNumber - 1].trim() : null
    };
  }
}

function checkHTMLFile(filePath) {
  console.log(`\n🔍 Checking ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const scripts = extractJavaScriptFromHTML(content);
  
  if (scripts.length === 0) {
    console.log(`✅ No JavaScript found in ${filePath}`);
    return true;
  }
  
  console.log(`📝 Found ${scripts.length} script block(s)`);
  
  let allValid = true;
  
  scripts.forEach((script, index) => {
    console.log(`\n🧪 Checking script block ${index + 1}...`);
    const result = validateJavaScript(script.content);
    
    if (result.valid) {
      console.log(`✅ Script block ${index + 1}: Valid`);
    } else {
      console.log(`❌ Script block ${index + 1}: ${result.error}`);
      
      // Try to find the approximate line number
      const lines = script.content.split('\n');
      const errorLine = result.error.match(/line (\d+)/);
      if (errorLine) {
        const lineNum = parseInt(errorLine[1]);
        console.log(`   Problem near line ${lineNum}: ${lines[lineNum - 1]?.trim()}`);
      }
      
      allValid = false;
    }
  });
  
  return allValid;
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node test-js-syntax.js <html-file>');
  console.log('Example: node test-js-syntax.js status/status.html');
  process.exit(1);
}

// Check each file provided
let allFilesValid = true;
args.forEach(filePath => {
  const isValid = checkHTMLFile(filePath);
  if (!isValid) {
    allFilesValid = false;
  }
});

console.log(`\n${allFilesValid ? '✅ All files valid' : '❌ Syntax errors found'}`);
process.exit(allFilesValid ? 0 : 1);
