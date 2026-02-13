#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

/**
 * Recursively find all SKILL.md files in a directory
 * @param {string} dir - Directory to search
 * @param {string} baseDir - Base directory for relative paths
 * @returns {string[]} Array of absolute paths to SKILL.md files
 */
function findSkillFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      results.push(...findSkillFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Parse a SKILL.md file and extract metadata
 * @param {string} filePath - Absolute path to SKILL.md file
 * @param {string} skillsDir - Base skills directory
 * @returns {Object} Skill entry object
 */
function parseSkillFile(filePath, skillsDir) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse YAML frontmatter (handle parsing errors gracefully)
  let data = {};
  try {
    const parsed = matter(content);
    data = parsed.data || {};
  } catch (err) {
    console.warn(`Warning: Failed to parse YAML frontmatter in ${filePath}: ${err.message}`);
    // Continue with empty data object
  }

  // Generate relative path from skills directory
  const relativePath = path.relative(skillsDir, filePath);

  // Generate stable ID from relative path (dirname, normalized to forward slashes)
  // This ensures consistent IDs across Windows/POSIX and strips the SKILL.md filename
  const id = path.dirname(relativePath).split(path.sep).join('/');

  // Determine source from first path component
  const pathParts = id.split('/');
  const source = pathParts[0] || 'unknown';

  // Extract name (last component before SKILL.md)
  const name = data.name || pathParts[pathParts.length - 1] || 'unnamed';

  // Build skill entry
  return {
    id,
    name,
    description: data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    source,
    path: `skills/${relativePath.replace(/\\/g, '/')}`, // Normalize path separators
    ...(Array.isArray(data['auto-context']) ? { autoContext: data['auto-context'] } : {}),
  };
}

/**
 * Generate skills manifest from a skills directory
 * @param {string} skillsDir - Path to skills directory (e.g., public/skills)
 * @returns {Object} Manifest object
 */
async function generateSkillsManifest(skillsDir) {
  // Find all SKILL.md files
  const skillFiles = findSkillFiles(skillsDir);

  // Parse each file
  const skills = skillFiles.map((filePath) => parseSkillFile(filePath, skillsDir));

  // Sort by ID for stable ordering
  skills.sort((a, b) => a.id.localeCompare(b.id));

  // Build manifest (no generatedAt for deterministic builds)
  return {
    version: 1,
    skills,
  };
}

/**
 * Main CLI entry point
 */
async function main() {
  const skillsDir = path.join(__dirname, '..', 'public', 'skills');
  const outputPath = path.join(skillsDir, 'manifest.json');

  console.log(`Generating skills manifest from: ${skillsDir}`);

  const manifest = await generateSkillsManifest(skillsDir);

  console.log(`Found ${manifest.skills.length} skills`);

  // Write manifest to file (only if content changed, for deterministic builds)
  const newContent = JSON.stringify(manifest, null, 2) + '\n';
  const existingContent = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf-8')
    : '';

  if (newContent !== existingContent) {
    fs.writeFileSync(outputPath, newContent, 'utf-8');
    console.log(`Manifest written to: ${outputPath}`);
  } else {
    console.log(`Manifest unchanged: ${outputPath}`);
  }
}

// Export for testing
module.exports = { generateSkillsManifest, findSkillFiles, parseSkillFile };

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Error generating manifest:', err);
    process.exit(1);
  });
}
