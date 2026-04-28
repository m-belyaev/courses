function getRandomJoke(jokes) {
  const randomIndex = Math.floor(Math.random() * jokes.length);
  return jokes[randomIndex];
}

exports.getRandomJoke = getRandomJoke;