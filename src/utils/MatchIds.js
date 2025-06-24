// build "<other>_<current>" for links
export const buildCombinedIds = (otherId, currentId) =>
  `${otherId}_${currentId}`;

// given the param and current user, return { otherId, matchId }
export const parseCombinedIds = (combinedIds, currentId) => {
  const [first, second] = combinedIds.split("_");
  const otherId = first === currentId ? second : first;
  const matchId = [first, second].sort().join("_"); // stable sorted id
  return { otherId, matchId };
};
