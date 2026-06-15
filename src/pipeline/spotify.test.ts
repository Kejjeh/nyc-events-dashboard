import { describe, it, expect } from 'vitest';
import { artistQueryFromTitle, matchesArtist, bestArtistMatch } from './spotify';

describe('artistQueryFromTitle', () => {
  it.each([
    ['Phish at Madison Square Garden', 'Phish'],
    ['Alan Broadbent Trio @ Birdland', 'Alan Broadbent Trio'],
    ['DOWNSTAIRS: Level Up! Video Game Club', 'Level Up! Video Game Club'],
    ['Joe Farnsworth Quartet | Smalls', 'Joe Farnsworth Quartet'],
    ['Jam Session w/ Adam Birnbaum', 'Jam Session'],
  ])('extracts %s -> %s', (title, expected) => {
    expect(artistQueryFromTitle(title)).toBe(expected);
  });
});

describe('matchesArtist (precision-first)', () => {
  it('accepts an exact name and an ensemble-suffixed name', () => {
    expect(matchesArtist('Alan Broadbent', 'Alan Broadbent')).toBe(true);
    expect(matchesArtist('Joe Farnsworth Quartet', 'Joe Farnsworth')).toBe(true);
    expect(matchesArtist('The Bad Plus', 'Bad Plus')).toBe(true); // leading "the" ignored
    expect(matchesArtist('Vanguard Jazz Orchestra', 'Vanguard Jazz Orchestra')).toBe(true);
  });

  it('rejects fuzzy near-misses Spotify would otherwise return', () => {
    expect(matchesArtist('Bruce Cox', 'Bruce Cockburn')).toBe(false);
    expect(matchesArtist('Vinyl After Hours', 'After Hours')).toBe(false);
    expect(matchesArtist('Afternoon Jam in the Cafe', 'Cozy Coffee Shop')).toBe(false);
    expect(matchesArtist('Alexi David', 'Alexa Davies')).toBe(false);
  });
});

describe('bestArtistMatch', () => {
  it('returns the first validly-matching candidate, else null', () => {
    const candidates = [{ name: 'Bruce Cockburn' }, { name: 'Bruce Cox' }];
    expect(bestArtistMatch('Bruce Cox', candidates)?.name).toBe('Bruce Cox');
    expect(bestArtistMatch('Nonexistent Act', [{ name: 'Something Else' }])).toBeNull();
  });
});
