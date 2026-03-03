export function calculateStats(history: number[]) {
  let redCount = 0;
  let blackCount = 0;
  let zeroCount = 0;
  let dozens = [0, 0, 0];
  let columns = [0, 0, 0];

  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  history.forEach(num => {
    if (num === 0) {
      zeroCount++;
    } else {
      if (redNumbers.includes(num)) redCount++;
      else blackCount++;

      if (num <= 12) dozens[0]++;
      else if (num <= 24) dozens[1]++;
      else dozens[2]++;

      if (num % 3 === 1) columns[0]++;
      else if (num % 3 === 2) columns[1]++;
      else columns[2]++;
    }
  });

  return { redCount, blackCount, zeroCount, dozens, columns };
}
