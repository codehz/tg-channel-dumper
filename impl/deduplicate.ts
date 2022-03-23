export default function deduplicate<T>() {
  const set = new Set<T>();
  return (item: T) => {
    if (set.has(item)) return false;
    set.add(item);
    return true;
  };
}
