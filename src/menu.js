const readline = require('readline');
const chalk = require('chalk');

function showMenu(title, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    let selected = defaultIndex;

    function render() {
      readline.cursorTo(process.stdout, 0, 0);
      readline.clearScreenDown(process.stdout);
      console.log(chalk.cyan(title));
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? chalk.green('> ') : '  ';
        const text = i === selected ? chalk.green(`[${i + 1}] ${options[i]}`) : chalk.gray(`[${i + 1}] ${options[i]}`);
        console.log(prefix + text);
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
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
    process.stdin.on('keypress', onKeypress);

    render();
  });
}

module.exports = { showMenu };
