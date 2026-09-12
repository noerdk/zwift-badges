import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalXp, accumulatorProgress, routeXpIndex, eventSeriesXpIndex, bestXp, isActive } from '../src/quests.js';
import { score } from '../src/plan.js';

// Shaped exactly like Zwift's payload: milestones pay out at a goalsCount
// threshold, so the XP for finishing one more goal is exact, not apportioned.
const shorts = {
  id: 'q1', name: 'Zwift Shorts', slug: 'zwiftshorts', isPublished: true,
  startDate: '2026-08-17T00:00:00Z', endDate: '2026-09-28T00:00:00Z',
  goals: [
    { completed: true, tasks: [{ completionRequirements: { type: 'ROUTE', routeId: 111 } }] },
    { completed: false, tasks: [{ completionRequirements: { type: 'ROUTE', routeId: 222 } }] },
    { completed: false, tasks: [{ completionRequirements: { type: 'ROUTE', routeId: 333 } }] },
  ],
  milestones: [
    { type: 'GOAL', goalsCount: 2, rewards: [{ rewardType: 'XP', experiencePoints: 250 }] },
    { type: 'GOAL', goalsCount: 3, rewards: [{ rewardType: 'XP', experiencePoints: 400 }] },
  ],
};

test('goal XP counts only milestones the next goal actually reaches', () => {
  const g = goalXp(shorts);
  assert.equal(g.completedGoals, 1);
  assert.equal(g.xpNow, 250, 'one more goal reaches the goalsCount=2 milestone only');
  assert.equal(g.xpRemaining, 650, 'both unreached milestones remain');
  assert.equal(goalXp(shorts, 2).xpNow, 650, 'two more goals reach both');
});

test('completed goals contribute no route XP opportunities', () => {
  const idx = routeXpIndex([shorts]);
  assert.ok(!idx.has(111), 'already-completed goal must not be offered again');
  assert.equal(bestXp(idx.get(222)), 250);
  assert.equal(bestXp(idx.get(333)), 250);
  assert.equal(bestXp(undefined), 0);
});

test('event tasks index by series id, paying only when a milestone is reached', () => {
  const goals = [{ completed: false, tasks: [{ completionRequirements: { type: 'EVENT', eventSeriesId: 13035 } }] }];
  // No goals done yet, so one event cannot reach the goalsCount=2 milestone.
  const far = eventSeriesXpIndex([{ ...shorts, goals }]);
  assert.equal(bestXp(far.get(13035)), 0, 'indexed as an opportunity, but pays nothing yet');
  assert.ok(far.has(13035));

  // ZRacing pays 1000 on the very first goal — that is the case that matters.
  const near = eventSeriesXpIndex([{
    ...shorts, goals,
    milestones: [{ type: 'GOAL', goalsCount: 1, rewards: [{ rewardType: 'XP', experiencePoints: 1000 }] }],
  }]);
  assert.equal(bestXp(near.get(13035)), 1000);
  assert.equal(near.has(999), false);
});

test('accumulator progress reports the next milestone, not the final target', () => {
  const acc = accumulatorProgress({
    goals: [{ tasks: [{ taskCard: { type: 'DISTANCE', targetDistanceMeters: 1000000, totalDistanceMeters: 9536, indoorDistanceMeters: 9536, outdoorDistanceMeters: 0, completionRatio: 0.009536 } }] }],
    milestones: [
      { type: 'ACCUMULATOR', distance: 250000, rewards: [{ rewardType: 'DROPS', drops: 100000 }] },
      { type: 'ACCUMULATOR', distance: 750000, rewards: [{ rewardType: 'XP', experiencePoints: 5000 }] },
    ],
  });
  assert.equal(acc.current, 9.536);
  assert.equal(acc.target, 1000);
  assert.equal(acc.nextMilestoneKm, 250, 'next unreached, not the 1000km end');
  assert.equal(acc.nextMilestoneXp, 0, 'that milestone pays drops, not XP');
  assert.equal(acc.xpRemaining, 5000);
});

test('quests respect their date window', () => {
  assert.ok(isActive(shorts, new Date('2026-09-10T00:00:00Z')));
  assert.ok(!isActive(shorts, new Date('2026-10-01T00:00:00Z')), 'ended');
  assert.ok(!isActive(shorts, new Date('2026-08-01T00:00:00Z')), 'not started');
  assert.ok(!isActive({ ...shorts, isArchived: true }, new Date('2026-09-10T00:00:00Z')));
});

test('quest XP can make an already-earned badge the best ride', () => {
  const route = { name: 'Sand And Sequoias', totalKm: 22.5, routeKm: 22.5, elevationM: 200, achievementId: 76, badgeXp: 460 };
  const athlete = { weightKg: 72.6, ftp: 225, flatSpeedKph: 32, effortFactor: 0.75 };
  const earned = new Set([76]);
  const plain = score(route, athlete, earned);
  const withQuest = score({ ...route, questXp: 500 }, athlete, earned);
  assert.equal(plain.badgeStatus, 'done');
  assert.equal(plain.questXp, 0);
  assert.equal(withQuest.xp - plain.xp, 500);
  assert.ok(withQuest.rate > plain.rate * 1.9, 'quest XP roughly doubles the rate here');
});
