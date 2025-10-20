#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Emoji regex pattern - matches most common emoji ranges
const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

// Allowed emojis (whitelist) - including individual components
const allowedEmojis = new Set(['❤️', '❤', '️']);

// Also allow the footer text pattern
const allowedPatterns = [
  /Made with ❤️ by (Slack Overflow|Pure Kikan)/g
];

// Directories to scan
const scanDirs = ['app', 'backend'];

// File extensions to check
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py'];

function scanDirectory(dir) {
  const results = [];
  const fullPath = join(projectRoot, dir);
  
  if (!statSync(fullPath).isDirectory()) {
    return results;
  }
  
  function traverse(currentPath) {
    const entries = readdirSync(currentPath);
    
    for (const entry of entries) {
      const fullEntryPath = join(currentPath, entry);
      const relativePath = fullEntryPath.replace(projectRoot + '/', '');
      const stat = statSync(fullEntryPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other common build directories
        if (!entry.startsWith('.') && !['node_modules', 'dist', 'build', '__pycache__'].includes(entry)) {
          traverse(fullEntryPath);
        }
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        // Skip test files
        if (entry.includes('test') || entry.includes('spec')) {
          return;
        }
        const content = readFileSync(fullEntryPath, 'utf8');
        const matches = [...content.matchAll(emojiRegex)];
        
        if (matches.length > 0) {
          // Check if entire content matches allowed patterns
          const isAllowedPattern = allowedPatterns.some(pattern => {
            const patternMatches = [...content.matchAll(pattern)];
            return patternMatches.length > 0;
          });
          
          if (isAllowedPattern) {
            continue; // Skip files with allowed patterns
          }
          
          const violations = matches.filter(match => !allowedEmojis.has(match[0]));
          
          if (violations.length > 0) {
            // Get line numbers for violations
            const lines = content.split('\n');
            const violationDetails = [];
            
            for (const violation of violations) {
              const index = content.indexOf(violation[0]);
              let lineNum = 1;
              let charCount = 0;
              
              for (const line of lines) {
                if (charCount + line.length >= index) {
                  violationDetails.push({
                    emoji: violation[0],
                    line: lineNum,
                    context: line.trim()
                  });
                  break;
                }
                charCount += line.length + 1; // +1 for newline
                lineNum++;
              }
            }
            
            results.push({
              file: relativePath,
              violations: violationDetails
            });
          }
        }
      }
    }
  }
  
  traverse(fullPath);
  return results;
}

function main() {
  console.log('🔍 Scanning for unauthorized emojis...');
  console.log(`Allowed emojis: ${Array.from(allowedEmojis).join(', ')}`);
  console.log();
  
  let totalViolations = 0;
  
  for (const dir of scanDirs) {
    console.log(`Scanning ${dir}/...`);
    const results = scanDirectory(dir);
    
    if (results.length === 0) {
      console.log(`  ✅ No violations found in ${dir}/`);
    } else {
      for (const result of results) {
        console.log(`  ❌ ${result.file}:`);
        for (const violation of result.violations) {
          console.log(`    Line ${violation.line}: "${violation.emoji}" in "${violation.context}"`);
          totalViolations++;
        }
      }
    }
    console.log();
  }
  
  if (totalViolations > 0) {
    console.log(`❌ Found ${totalViolations} emoji violations.`);
    console.log('Please replace emojis with lucide-react icons or add them to the whitelist.');
    process.exit(1);
  } else {
    console.log('✅ No emoji violations found!');
    process.exit(0);
  }
}

main();