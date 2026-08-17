// Fixed set of titles spanning common YouTube genres, used only to
// calibrate the score distribution for a newly saved intent (see
// shared/scoring.js#computeCalibration). Never shown to the user and
// never scored against real feed content — just a stable yardstick so an
// absolute cutoff can be derived instead of a fragile raw cosine constant.
export const PROBE_TITLES = [
  "10 Minute Full Body Workout for Beginners",
  "How to Make the Perfect Scrambled Eggs",
  "Top 10 Funniest Fails Compilation 2024",
  "Premier League Highlights: Best Goals This Week",
  "I Built a Custom Gaming PC From Scratch",
  "Reacting to the Craziest TikToks",
  "Stock Market Crash Explained in 5 Minutes",
  "Minecraft Hardcore Survival Episode 47",
  "How I Paid Off $50,000 in Debt",
  "Celebrity Couple Breakup Drama Explained",
  "Beginner's Guide to Watercolor Painting",
  "New iPhone Unboxing and First Impressions",
  "Learn Piano in 30 Days Challenge",
  "Documentary: The Fall of Ancient Rome",
  "Cooking a 3 Course Meal on a Budget",
  "My Dog Reacts to Fireworks for the First Time",
  "True Crime Case Files: The Unsolved Mystery",
  "Road Trip Vlog: Driving Across the Country",
  "ASMR Soap Cutting and Cube Sounds",
  "Late Night Talk Show Best Moments",
  "How Vaccines Work: A Simple Explanation",
  "Building a Treehouse With My Kids",
  "NBA Trade Rumors and Free Agency News",
  "Makeup Tutorial: Everyday Natural Look",
  "Car Review: Is the New Model Worth It?",
  "History of the Roman Empire in 10 Minutes",
  "Podcast Clip: Debating Free Will",
  "Kids Cartoon Compilation for Toddlers",
  "Political Debate Highlights and Analysis",
  "Home Renovation Before and After Reveal",
];
