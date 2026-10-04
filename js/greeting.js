// A one-off welcome card, shown over everything the first time the app opens
// while it is current, and never again on that device once he taps it away.
//
// The site is public, so the words stay general: anyone could open the link.
// The monster's name is the only personal touch, and it comes from the save
// on whichever device is looking.
//
// To retire one, let `until` pass. To make a new one, give it a new `id`, or
// a device that cleared the last one would never see it.

export const GREETING = {
  id: 'trip-2026-10',
  until: '2026-10-08', // last day it can appear
  title: 'Have a great trip!',
  message: (name) => `${name} can't wait to hear all about your adventure.`,
  button: "Let's go!",
  // 256 x 160, the same size as the room, drawn at 1x and scaled up crisp.
  // Until the file exists the card shows the emoji instead.
  image: 'assets/greetings/trip.png',
  standIn: '✈️ 🦖 🐉 🧱',
};

const seenKey = (greeting) => `habit-monster-greeting-${greeting.id}`;

// Pure, so the rule can be tested: an active greeting he has not cleared.
export function shouldGreet(greeting, today, seen) {
  return Boolean(greeting) && today <= greeting.until && !seen;
}

function hasSeen(greeting) {
  try {
    return localStorage.getItem(seenKey(greeting)) === 'true';
  } catch {
    return false;
  }
}

// Shows the card if it is due, and calls `onClear` when he taps it away.
export function showGreeting({ today, name, onClear }) {
  const greeting = GREETING;
  if (!shouldGreet(greeting, today, hasSeen(greeting))) return;

  const root = document.getElementById('greeting');
  const picture = document.getElementById('greeting-art');
  const standIn = document.getElementById('greeting-stand-in');
  document.getElementById('greeting-title').textContent = greeting.title;
  document.getElementById('greeting-message').textContent = greeting.message(name);
  const button = document.getElementById('greeting-ok');
  button.textContent = greeting.button;

  standIn.textContent = greeting.standIn;
  picture.hidden = true;
  picture.onload = () => {
    picture.hidden = false;
    standIn.hidden = true;
  };
  picture.src = greeting.image;

  root.hidden = false;
  button.focus();
  button.onclick = () => {
    try {
      localStorage.setItem(seenKey(greeting), 'true');
    } catch {
      // Private browsing: it will just greet him again next time.
    }
    root.hidden = true;
    onClear?.();
  };
}
