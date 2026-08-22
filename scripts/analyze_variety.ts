import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('simulation_results_3.json', 'utf8'));
const matches = data.rawMatches;

let repeat4 = 0;
let repeat3 = 0;

for (let i = 0; i < matches.length; i++) {
  const m1 = matches[i].players; // array of 4 sorted strings
  
  // Compare to all previous matches
  for (let j = 0; j < i; j++) {
    const m2 = matches[j].players;
    
    // Count intersections
    let shared = 0;
    for (const p of m1) {
      if (m2.includes(p)) shared++;
    }
    
    if (shared === 4) {
      repeat4++;
    } else if (shared === 3) {
      repeat3++;
    }
  }
}

console.log(`Out of ${matches.length} matches analyzed:`);
console.log(`4-player exact repeats: ${repeat4}`);
console.log(`3-player overlap repeats: ${repeat3}`);

