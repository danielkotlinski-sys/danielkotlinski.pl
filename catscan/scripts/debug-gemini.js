#!/usr/bin/env node
/**
 * Diagnostic script: tests the entire Gemini video analysis pipeline
 * step by step, with detailed logging at each stage.
 *
 * Usage: node scripts/debug-gemini.js
 * Run from /root/repo/catscan directory
 */

const { execSync } = require('child_process');
const { existsSync, statSync, unlinkSync, writeFileSync } = require('fs');
const { join } = require('path');
const { randomUUID } = require('crypto');

// Load .env
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = require('fs').readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const COOKIES_PATH = join(process.cwd(), 'data', 'youtube-cookies.txt');
const TMP_DIR = '/tmp/catscan-debug';
const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=d3edTpNt4L0';

function log(step, status, detail) {
  const icon = status === 'OK' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`${icon} [${step}] ${detail}`);
}

async function main() {
  console.log('=== GEMINI VIDEO PIPELINE DIAGNOSTIC ===\n');

  // Step 0: Check prerequisites
  log('ENV', GEMINI_KEY ? 'OK' : 'FAIL', `GEMINI_API_KEY: ${GEMINI_KEY ? GEMINI_KEY.slice(0, 10) + '...' : 'NOT SET'}`);
  if (!GEMINI_KEY) return;

  log('ENV', existsSync(COOKIES_PATH) ? 'OK' : 'FAIL', `Cookies file: ${COOKIES_PATH} exists=${existsSync(COOKIES_PATH)}`);

  // Step 0b: Test Gemini API with simple text request
  log('API', '⏳', 'Testing Gemini API with text prompt...');
  try {
    const textResult = execSync(
      `curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"contents":[{"parts":[{"text":"Say OK"}]}]}'`,
      { timeout: 15000 }
    ).toString();
    const textJson = JSON.parse(textResult);
    if (textJson.error) {
      log('API', 'FAIL', `Gemini text API error: ${JSON.stringify(textJson.error)}`);
      return;
    }
    const textOutput = textJson.candidates?.[0]?.content?.parts?.[0]?.text || 'no text';
    log('API', 'OK', `Gemini text API works: "${textOutput.trim()}"`);
  } catch (e) {
    log('API', 'FAIL', `Gemini text API exception: ${e.message}`);
    return;
  }

  // Step 1: Download video
  execSync(`mkdir -p ${TMP_DIR}`);
  const videoPath = join(TMP_DIR, `test-${randomUUID()}.mp4`);
  log('DOWNLOAD', '⏳', `Downloading ${TEST_VIDEO_URL}...`);

  const cookiesFlag = existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : '';
  const jsFlag = '--js-runtimes node --remote-components ejs:github';

  try {
    execSync(
      `yt-dlp --no-playlist --max-filesize 100M --socket-timeout 30 ` +
      `${cookiesFlag} ${jsFlag} ` +
      `-f "best[ext=mp4][filesize<100M]/best[ext=mp4]/best" ` +
      `-o "${videoPath}" "${TEST_VIDEO_URL}" 2>&1`,
      { timeout: 120000 }
    );
    if (existsSync(videoPath) && statSync(videoPath).size > 0) {
      log('DOWNLOAD', 'OK', `File: ${videoPath}, size: ${(statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB`);
    } else {
      log('DOWNLOAD', 'FAIL', 'File not created or empty');
      return;
    }
  } catch (e) {
    log('DOWNLOAD', 'FAIL', `yt-dlp error: ${e.stderr?.toString()?.slice(-300) || e.message}`);
    return;
  }

  // Step 2: Upload to Gemini
  log('UPLOAD', '⏳', 'Uploading to Gemini File API...');
  let fileUri = null;
  try {
    const fileSize = statSync(videoPath).size;
    const uploadInitResult = execSync(
      `curl -s -X POST "https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}" ` +
      `-H "X-Goog-Upload-Protocol: resumable" ` +
      `-H "X-Goog-Upload-Command: start" ` +
      `-H "X-Goog-Upload-Header-Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Header-Content-Type: video/mp4" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"file": {"display_name": "debug-test.mp4"}}' -D -`,
      { timeout: 30000 }
    ).toString();

    const uploadUrlMatch = uploadInitResult.match(/x-goog-upload-url:\s*(.+)/i);
    if (!uploadUrlMatch) {
      log('UPLOAD', 'FAIL', `No upload URL in response. Response headers:\n${uploadInitResult.split('\n').filter(l => l.startsWith('x-goog') || l.startsWith('HTTP')).join('\n')}`);
      // Check if there's a JSON error in the body
      const jsonMatch = uploadInitResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) log('UPLOAD', 'FAIL', `Response body: ${jsonMatch[0].slice(0, 500)}`);
      return;
    }

    const uploadUrl = uploadUrlMatch[1].trim();
    log('UPLOAD', 'OK', `Got upload URL`);

    // Upload the file
    const uploadResult = execSync(
      `curl -s -X POST "${uploadUrl}" ` +
      `-H "Content-Length: ${fileSize}" ` +
      `-H "X-Goog-Upload-Offset: 0" ` +
      `-H "X-Goog-Upload-Command: upload, finalize" ` +
      `--data-binary "@${videoPath}"`,
      { timeout: 120000 }
    ).toString();

    const uploadJson = JSON.parse(uploadResult);
    fileUri = uploadJson?.file?.uri;
    if (fileUri) {
      log('UPLOAD', 'OK', `File URI: ${fileUri}`);
    } else {
      log('UPLOAD', 'FAIL', `No file URI. Response: ${uploadResult.slice(0, 500)}`);
      return;
    }
  } catch (e) {
    log('UPLOAD', 'FAIL', `Upload error: ${e.message}`);
    return;
  }

  // Step 3: Wait for processing
  log('PROCESSING', '⏳', 'Waiting for Gemini to process video...');
  const fileName = fileUri.split('/').pop();
  let processed = false;
  for (let i = 0; i < 30; i++) {
    try {
      const statusResult = execSync(
        `curl -s "https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${GEMINI_KEY}"`,
        { timeout: 15000 }
      ).toString();
      const statusJson = JSON.parse(statusResult);
      if (statusJson.state === 'ACTIVE') {
        log('PROCESSING', 'OK', `Video is ACTIVE after ${i * 2} seconds`);
        processed = true;
        break;
      } else if (statusJson.state === 'FAILED') {
        log('PROCESSING', 'FAIL', `Processing FAILED: ${JSON.stringify(statusJson)}`);
        break;
      }
      // Still processing, wait
      if (i % 5 === 0) log('PROCESSING', '⏳', `State: ${statusJson.state}, waiting... (${i * 2}s)`);
      execSync('sleep 2');
    } catch (e) {
      log('PROCESSING', 'FAIL', `Status check error: ${e.message}`);
      break;
    }
  }

  if (!processed) {
    log('PROCESSING', 'FAIL', 'Timeout or failure');
    return;
  }

  // Step 4: Analyze with Gemini
  log('ANALYZE', '⏳', 'Sending to Gemini 2.5 Flash for analysis...');
  try {
    const prompt = 'What is this video about? Describe in 2-3 sentences.';
    const reqBody = JSON.stringify({
      contents: [{
        parts: [
          { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
    });

    const reqPath = join(TMP_DIR, `req-${randomUUID()}.json`);
    writeFileSync(reqPath, reqBody);

    const analyzeResult = execSync(
      `curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}" ` +
      `-H "Content-Type: application/json" -d @${reqPath}`,
      { timeout: 90000 }
    ).toString();

    try { unlinkSync(reqPath); } catch {}

    const analyzeJson = JSON.parse(analyzeResult);
    if (analyzeJson.error) {
      log('ANALYZE', 'FAIL', `Gemini error: ${JSON.stringify(analyzeJson.error)}`);
      return;
    }

    const text = analyzeJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      log('ANALYZE', 'OK', `Gemini response: "${text.slice(0, 300)}"`);
    } else {
      log('ANALYZE', 'FAIL', `No text in response: ${analyzeResult.slice(0, 500)}`);
      return;
    }
  } catch (e) {
    log('ANALYZE', 'FAIL', `Analysis error: ${e.message}`);
    return;
  }

  // Cleanup
  try { unlinkSync(videoPath); } catch {}

  console.log('\n=== ALL STEPS PASSED ===');
  console.log('If this works but the pipeline doesn\'t, the issue is in how youtube-reviews.ts calls these functions.');
  console.log('Check: model name in .next/ build, GEMINI_API_KEY in .env, and that the build was rebuilt after changes.');
}

main().catch(e => console.error('Fatal:', e));
