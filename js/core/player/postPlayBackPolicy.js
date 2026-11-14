export function shouldExitPostPlayOnLongBack({
  postPlayVisible = false,
  isBack = false,
  repeat = false,
  modalOpen = false
} = {}) {
  return Boolean(postPlayVisible && isBack && repeat && !modalOpen);
}
