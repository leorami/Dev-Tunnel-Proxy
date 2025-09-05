const fs = require('fs');
const path = require('path');

/**
 * Conflict Resolution for Route Declarations
 * 
 * Handles cases where multiple nginx .conf files declare the same route.
 * Provides persistent conflict resolution that survives proxy restarts.
 */

const CONFLICT_RESOLUTIONS_FILE = path.join(__dirname, '..', '.artifacts', 'route-resolutions.json');

/**
 * Load existing conflict resolutions from disk
 */
function loadResolutions() {
  try {
    if (fs.existsSync(CONFLICT_RESOLUTIONS_FILE)) {
      const content = fs.readFileSync(CONFLICT_RESOLUTIONS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`Failed to load route resolutions: ${error.message}`);
  }
  return {};
}

/**
 * Save conflict resolutions to disk
 */
function saveResolutions(resolutions) {
  try {
    // Ensure .artifacts directory exists
    const dir = path.dirname(CONFLICT_RESOLUTIONS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(CONFLICT_RESOLUTIONS_FILE, JSON.stringify(resolutions, null, 2));
  } catch (error) {
    console.warn(`Failed to save route resolutions: ${error.message}`);
  }
}

/**
 * Resolve route conflicts using a deterministic strategy with persistence
 * 
 * Strategy:
 * 1. Check for existing resolution in persistent storage
 * 2. If no resolution exists, use "first config wins" (order of file discovery)
 * 3. Save the resolution for future proxy restarts
 * 
 * @param {Map} conflicts - Map of route -> array of conflicting declarations
 * @returns {Object} Resolution decisions and warnings
 */
function resolveConflicts(conflicts) {
  const resolutions = loadResolutions();
  const newResolutions = {};
  const warnings = [];
  const resolved = new Map();
  
  for (const [route, declarations] of conflicts) {
    const conflictKey = `${route}`;
    const currentFiles = declarations.map(d => d.sourceFile).sort();
    
    // Check if we have a stored resolution
    const storedResolution = resolutions[conflictKey];
    
    let winner;
    if (storedResolution && currentFiles.includes(storedResolution.winner)) {
      // Use existing resolution if the winner file still exists
      winner = storedResolution.winner;
      warnings.push(`Route ${route}: Using persisted resolution - ${winner} wins (conflicts with ${currentFiles.filter(f => f !== winner).join(', ')})`);
    } else {
      // Create new resolution: first config file wins (order of discovery)
      // Since declarations array preserves the order files were processed
      winner = declarations[0].sourceFile;
      newResolutions[conflictKey] = {
        winner,
        conflictingFiles: currentFiles,
        resolvedAt: new Date().toISOString(),
        strategy: 'first-config-wins'
      };
      warnings.push(`Route ${route}: NEW CONFLICT - ${winner} wins (first config) over ${currentFiles.filter(f => f !== winner).join(', ')}`);
    }
    
    // Find the winning declaration
    const winningDeclaration = declarations.find(d => d.sourceFile === winner);
    resolved.set(route, winningDeclaration);
  }
  
  // Save any new resolutions
  if (Object.keys(newResolutions).length > 0) {
    const updatedResolutions = { ...resolutions, ...newResolutions };
    saveResolutions(updatedResolutions);
  }
  
  return {
    resolved,
    warnings,
    newConflicts: Object.keys(newResolutions).length,
    totalConflicts: conflicts.size
  };
}

/**
 * Apply conflict resolutions to route list
 * Replaces conflicted routes with their resolved winners
 */
function applyResolutions(routes, conflicts) {
  if (!conflicts || conflicts.size === 0) {
    return { routes, warnings: [] };
  }
  
  const resolution = resolveConflicts(conflicts);
  
  // Replace conflicted routes with resolved winners
  const finalRoutes = routes.map(route => {
    if (resolution.resolved.has(route.route)) {
      const resolvedRoute = resolution.resolved.get(route.route);
      // Only replace if this route lost the conflict
      if (resolvedRoute.sourceFile !== route.sourceFile) {
        return null; // Filter out losing routes
      }
    }
    return route;
  }).filter(Boolean);
  
  return {
    routes: finalRoutes,
    warnings: resolution.warnings,
    conflictSummary: {
      newConflicts: resolution.newConflicts,
      totalConflicts: resolution.totalConflicts
    }
  };
}

/**
 * Clear all stored conflict resolutions (for testing/reset)
 */
function clearResolutions() {
  try {
    if (fs.existsSync(CONFLICT_RESOLUTIONS_FILE)) {
      fs.unlinkSync(CONFLICT_RESOLUTIONS_FILE);
      return true;
    }
  } catch (error) {
    console.warn(`Failed to clear resolutions: ${error.message}`);
  }
  return false;
}

module.exports = {
  resolveConflicts,
  applyResolutions,
  loadResolutions,
  saveResolutions,
  clearResolutions,
  CONFLICT_RESOLUTIONS_FILE
};
