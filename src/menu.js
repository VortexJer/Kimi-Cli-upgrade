const readline = require('readline');
const chalk = require('chalk');

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K';

// Arrow-key menu with flicker-free, in-place redraw. The title is printed once;
// on every keypress only the option lines are rewritten (cursor moved up N lines,
// each line cleared and reprinted). No full-screen clear -> no flicker, and it
// does not assume the menu sits at the top of the screen.
function showMenu(title, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log(chalk.gray(`${title} (non-interactive, using default)`));
      resolve(defaultIndex);
      return;
    }

    let selected = defaultIndex;
    let rendered = false;

    function drawOptions(isUpdate) {
      if (isUpdate) {
        process.stdout.write(`\x1b[${options.length}A`); // move to first option line
      }
      for (let i = 0; i < options.length; i++) {
        const marker = i === selected ? chalk.green('> ') : '  ';
        const label = `[${i + 1}] ${options[i]}`;
        const text = i === selected ? chalk.green(label) : chalk.gray(label);
        process.stdout.write(CLEAR_LINE + marker + text + '\n');
      }
    }

    function render() {
      if (!rendered) {
        process.stdout.write(chalk.cyan(title) + '\n');
        drawOptions(false);
        rendered = true;
      } else {
        drawOptions(true);
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
    }

    function onKeypress(str, key) {
      if (!key) return;
      if (key.name === 'up') {
        selected = selected > 0 ? selected - 1 : options.length - 1;
        render();
      } else if (key.name === 'down') {
        selected = selected < options.length - 1 ? selected + 1 : 0;
        render();
      } else if (key.name === 'return') {
        cleanup();
        resolve(selected);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(defaultIndex);
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(HIDE_CURSOR);
    process.stdin.on('keypress', onKeypress);

    render();
  });
}

module.exports = { showMenu };
