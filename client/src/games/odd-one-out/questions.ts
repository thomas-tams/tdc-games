export interface Question {
  id: number;
  prompt: string;
  options: [string, string, string, string];
}

export const QUESTION_POOL: Question[] = [
  {
    id: 0,
    prompt: 'Which superpower would you pick?',
    options: ['Flight', 'Invisibility', 'Time travel', 'Mind reading'],
  },
  {
    id: 1,
    prompt: 'You can only keep one for the rest of your life:',
    options: ['Coffee', 'Alcohol', 'Chocolate', 'Cheese'],
  },
  {
    id: 2,
    prompt: 'Best pizza topping?',
    options: ['Pepperoni', 'Margherita', 'Hawaiian', 'BBQ Chicken'],
  },
  {
    id: 3,
    prompt: 'Where would you live if money was no object?',
    options: ['Beach house', 'Mountain cabin', 'City penthouse', 'Countryside estate'],
  },
  {
    id: 4,
    prompt: 'Best decade for music?',
    options: ['70s', '80s', '90s', '2000s'],
  },
  {
    id: 5,
    prompt: 'You have to give up one forever:',
    options: ['Social media', 'TV & movies', 'Music', 'Video games'],
  },
  {
    id: 6,
    prompt: 'Pick your ideal vacation:',
    options: ['Road trip', 'Beach resort', 'European tour', 'Adventure trek'],
  },
  {
    id: 7,
    prompt: 'Best way to spend a rainy Sunday?',
    options: ['Binge a show', 'Read a book', 'Cook something fancy', 'Sleep all day'],
  },
  {
    id: 8,
    prompt: 'Worst habit to have?',
    options: ['Always late', 'Loud chewing', 'Phone during conversations', 'Never replying to texts'],
  },
  {
    id: 9,
    prompt: 'You can only eat one cuisine for a year:',
    options: ['Italian', 'Japanese', 'Mexican', 'Indian'],
  },
  {
    id: 10,
    prompt: 'Best pet to have?',
    options: ['Dog', 'Cat', 'Fish', 'No pets'],
  },
  {
    id: 11,
    prompt: 'Which era would you time-travel to?',
    options: ['Ancient Rome', 'Medieval times', 'The 1920s', '100 years in the future'],
  },
  {
    id: 12,
    prompt: 'Pick your go-to karaoke song genre:',
    options: ['Power ballad', 'Pop hit', 'Rock anthem', 'Rap banger'],
  },
  {
    id: 13,
    prompt: 'Most overrated thing?',
    options: ['Brunch', 'New Year\'s Eve', 'Avocado toast', 'True crime podcasts'],
  },
  {
    id: 14,
    prompt: 'You can master one skill instantly:',
    options: ['Play an instrument', 'Speak every language', 'Cook like a chef', 'Code anything'],
  },
  {
    id: 15,
    prompt: 'Worst way to start your morning?',
    options: ['Cold shower', 'No coffee', 'Alarm didn\'t go off', 'Phone is dead'],
  },
  {
    id: 16,
    prompt: 'Best season of the year?',
    options: ['Spring', 'Summer', 'Autumn', 'Winter'],
  },
  {
    id: 17,
    prompt: 'You\'re stranded on an island, pick one item:',
    options: ['Knife', 'Lighter', 'Rope', 'Tarp'],
  },
  {
    id: 18,
    prompt: 'Ideal first date?',
    options: ['Dinner', 'Drinks at a bar', 'Activity (bowling, arcade)', 'Coffee walk'],
  },
  {
    id: 19,
    prompt: 'Most annoying thing at a party?',
    options: ['Bad music', 'No food left', 'Someone won\'t stop talking', 'It ends too early'],
  },
  {
    id: 20,
    prompt: 'Pick your fictional universe to live in:',
    options: ['Harry Potter', 'Star Wars', 'Lord of the Rings', 'Marvel'],
  },
  {
    id: 21,
    prompt: 'Best way to exercise?',
    options: ['Gym', 'Running', 'Team sport', 'I don\'t'],
  },
  {
    id: 22,
    prompt: 'You win the lottery. First purchase?',
    options: ['House', 'Car', 'Trip around the world', 'Quit your job and do nothing'],
  },
  {
    id: 23,
    prompt: 'Most important quality in a friend?',
    options: ['Loyalty', 'Humor', 'Honesty', 'Adventurousness'],
  },
  {
    id: 24,
    prompt: 'Worst food crime?',
    options: ['Ketchup on steak', 'Pineapple on pizza', 'Well-done steak', 'Mayo on fries'],
  },
  {
    id: 25,
    prompt: 'Pick your dream job (no money worries):',
    options: ['Travel blogger', 'Game designer', 'Chef / restaurant owner', 'Musician'],
  },
  {
    id: 26,
    prompt: 'Best movie genre?',
    options: ['Action', 'Comedy', 'Horror', 'Sci-Fi'],
  },
  {
    id: 27,
    prompt: 'You can only drink one thing forever (besides water):',
    options: ['Beer', 'Wine', 'Cocktails', 'Soda'],
  },
  {
    id: 28,
    prompt: 'Biggest red flag in a person?',
    options: ['Rude to waiters', 'Never apologizes', 'Always on their phone', 'One-ups every story'],
  },
  {
    id: 29,
    prompt: 'How do you handle confrontation?',
    options: ['Head on', 'Avoid it completely', 'Passive-aggressive text', 'Vent to someone else'],
  },
];

export function selectQuestionsForGame(count: number = 5): number[] {
  const indices = QUESTION_POOL.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}
