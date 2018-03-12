#!/usr/bin/env node
'use strict';

var fs = require('fs');
var _ = require('lodash');
var shelljs = require('shelljs');
var cli = require('commander');
var cwd = process.cwd();
var installSubsetPackageJson = require('./package.json');
var packageJson = require(cwd + '/package.json');
var spawnSync = require('child_process').spawnSync;

var backup = function(filename) {
  try {
    fs.writeFileSync(cwd + '/' + filename + '.backup', fs.readFileSync(cwd + '/' + filename));
    fs.unlinkSync(cwd + '/' + filename);
  } catch (err) {}
};

var restore = function(filename) {
  try {
    fs.writeFileSync(cwd + '/' + filename, fs.readFileSync(cwd + '/' + filename + '.backup'));
    fs.unlinkSync(cwd + '/' + filename + '.backup');
  } catch (err) {}
};

cli
  .command('install [input_string]')
  .alias('i')
  .option('-d, --clean', 'remove node_modules first')
  .option('--npm', 'use npm to install')
  .description('install a given subset defined in package.json')
  .action(function(input_string, options) {
    if (!input_string) {
      throw 'Please provide an install subset name';
    }

    if (!packageJson.subsets) {
      throw 'No install subsets in package.json';
    }

    if (!packageJson.subsets[input_string]) {
      throw 'No install subset with that name';
    }

    const subset = packageJson.subsets[input_string];

    // prune devDependencies according to subset declarations and options
    if (subset.include) {
      packageJson.devDependencies = _.pick(packageJson.devDependencies, subset.include);
    } else if (subset.exclude) {
      packageJson.devDependencies = _.omit(packageJson.devDependencies, subset.exclude);
    } else {
      throw 'No valid subset actions found';
    }

    // backup package.json and lockfiles to restore later
    backup('package.json');
    backup('package-lock.json');
    backup('yarn.lock');

    if (options.clean) {
      shelljs.rm('-rf', cwd + '/node_modules');
    }

    try {
      // write the new temp package.json
      fs.writeFileSync(cwd + '/package.json', JSON.stringify(packageJson, null, '  '));

      // choose which installer to use, then spawn
      if (!options.npm && shelljs.which('yarn')) {
        var installer = spawnSync('yarn', ['install'], { stdio: 'inherit' });
      } else {
        var installer = spawnSync('npm', ['install'], { stdio: 'inherit' });
      }
    } catch (err) {} // err doesn't matter, need to perform cleanup operations

    // restore package.json and lockfiles from backup
    restore('package.json');
    restore('package-lock.json');
    restore('yarn.lock');

    if (installer.status !== 0) {
      throw 'Error code ' + installer.status;
    }

    console.log('Installation of subset "' + input_string + '" successful');
  });

cli.command('*').action(() => cli.help());

cli.version(installSubsetPackageJson.version).parse(process.argv);

if (cli.args.length === 0) cli.help();

process.on('uncaughtException', err => {
  console.log('ERROR: ' + err);
});
