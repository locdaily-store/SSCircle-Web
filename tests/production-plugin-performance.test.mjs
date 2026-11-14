import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('Paper statistics guard: bounded capture and off-thread queue persistence', () => {
  const source = read('minecraft-link-paper/src/main/java/id/sscircle/paper/PaperStatsSync.java');
  assert.match(source, /private void captureOneTick\(\)/);
  assert.match(source, /while\(budget-->0&&activeJob\.index<blockMaterials\.size\(\)\)/);
  assert.match(source, /private int currentReadBudget\(\)/);
  assert.match(source, /lowTps\?lowTpsBlockReadsPerTick:blockReadsPerTick/);
  assert.match(source, /newSingleThreadExecutor/);
  assert.match(source, /diskWriter\.execute\(this::drainWrites\)/);
  assert.match(source, /waitingWrite\.set\(new ArrayList<>\(pending\.values\(\)\)\)/);
  assert.match(source, /http\.sendAsync\(/);
  assert.match(source, /queueFull=pending\.size\(\)>=MAX_PENDING/);
  assert.match(source, /StandardCopyOption\.ATOMIC_MOVE/);
});

test('Skin bridge guard: bounded concurrency, TPS pause and async network work', () => {
  const source = read('minecraft-skin-bridge-paper/src/main/java/id/sscircle/skin/SkinPublisher.java');
  assert.match(source, /MAX_ACTIVE=2/);
  assert.match(source, /MAX_IMAGE_BYTES=131072/);
  assert.match(source, /active\.get\(\)>=MAX_ACTIVE\|\|pauseForLowTps\(\)/);
  assert.match(source, /runTaskAsynchronously\(plugin/);
  assert.match(source, /readNBytes\(MAX_IMAGE_BYTES\+1\)/);
  assert.match(source, /skin-sync\.pause-on-low-tps/);
});
