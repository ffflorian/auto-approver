export function getPlural(word: string, count: number, postfix: string = 's'): string {
  return count === 1 ? word : `${word}${postfix}`;
}
