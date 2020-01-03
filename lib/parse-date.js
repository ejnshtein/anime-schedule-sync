export default date => {
  const parsed = date.match(/([0-9]+)\/([0-9]+)/i)
  return {
    date: parseInt(parsed[2]),
    month: parseInt(parsed[1])
  }
}
