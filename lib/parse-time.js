export default time => {
  const parsed = time.match(/([0-9]+):([0-9]+)/i)
  return {
    hour: Number.parseInt(parsed[1]),
    minute: Number.parseInt(parsed[2])
  }
}
