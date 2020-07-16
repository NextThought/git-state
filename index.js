'use strict'
const fs = require('fs')
const path = require('path')
const { exec, execSync } = require('child_process')
const { promisify } = require('util')

// Prevent from failing on windows
const nullPath = /^win/.test(process.platform) ? 'nul' : '/dev/null'

// Consider EOL as \n because either Windows or *nix, this escape char will be there
const EOL = /\r?\n/

Object.assign(exports, {
  ahead,
  aheadSync,
  behind,
  behindSync,
  branch,
  branchSync,
  check,
  checkSync,
  commit,
  commitSync,
  dirty,
  dirtySync,
  isGit,
  isGitSync,
  message,
  messageSync,
  remoteBranch,
  remoteBranchSync,
  stashes,
  stashesSync,
  status,
  statusSync,
  untracked,
  untrackedSync
})

function isGit (dir, cb) {
  fs.stat(path.join(dir, '.git'), function (err) {
    cb(!err) // eslint-disable-line standard/no-callback-literal
  })
}

function isGitSync (dir) {
  return fs.existsSync(path.join(dir, '.git'))
}

function checkSync (repo, opts) {
  const { dirty, untracked } = statusSync(repo, opts)
  return {
    branch: branchSync(repo, opts),
    remoteBranch: remoteBranchSync(repo, opts),
    ahead: aheadSync(repo, opts),
    behind: behindSync(repo, opts),
    dirty,
    untracked,
    stashes: stashesSync(repo, opts)
  }
}

function check (repo, opts, cb) {
  if (typeof opts === 'function') return check(repo, {}, opts)

  Promise.all([
    promisify(branch)(repo, opts),
    promisify(remoteBranch)(repo, opts),
    promisify(ahead)(repo, opts),
    promisify(behind)(repo, opts),
    promisify(stashes)(repo, opts),
    promisify(status)(repo, opts)
  ])
    .then(
      ([branch, remoteBranch, ahead, behind, stashes, { dirty, untracked }]) => cb(null, { branch, remoteBranch, ahead, behind, dirty, untracked, stashes }),
      cb
    )
}

function untracked (repo, opts, cb) {
  if (typeof opts === 'function') return untracked(repo, {}, opts)

  status(repo, opts, function (err, result) {
    if (err) return cb(err)
    cb(null, result.untracked)
  })
}

function dirty (repo, opts, cb) {
  if (typeof opts === 'function') return dirty(repo, {}, opts)

  status(repo, opts, function (err, result) {
    if (err) return cb(err)
    cb(null, result.dirty)
  })
}

function branch (repo, opts, cb) {
  if (typeof opts === 'function') return branch(repo, {}, opts)
  opts = opts || {}

  exec('git show-ref >' + nullPath + ' 2>&1 && git rev-parse --abbrev-ref HEAD', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) {
      if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return cb(err)
      if (err.message === 'stdout maxBuffer exceeded') return cb(err)
      return cb() // most likely the git repo doesn't have any commits yet
    }
    cb(null, stdout.trim())
  })
}

function remoteBranch (repo, opts, cb) {
  if (typeof opts === 'function') return remoteBranch(repo, {}, opts)
  opts = opts || {}

  exec('git show-ref >' + nullPath + ' 2>&1 && git rev-parse --abbrev-ref --symbolic-full-name @{u}', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) {
      if (err.message === 'stdout maxBuffer exceeded') return cb(err)
      return cb() // most likely the git repo doesn't have any commits yet
    }
    cb(null, stdout.trim())
  })
}

function ahead (repo, opts, cb) {
  if (typeof opts === 'function') return ahead(repo, {}, opts)
  opts = opts || {}

  exec('git show-ref >' + nullPath + ' 2>&1 && git rev-list HEAD --not --remotes', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) {
      if (err.message === 'stdout maxBuffer exceeded') return cb(err)
      return cb(null, NaN) // depending on the state of the git repo, the command might return non-0 exit code
    }
    stdout = stdout.trim()
    cb(null, !stdout ? 0 : parseInt(stdout.split(EOL).length, 10))
  })
}

function behind (repo, opts, cb) {
  if (typeof opts === 'function') return behind(repo, {}, opts)
  opts = opts || {}
  remoteBranch(repo, opts, function (er, remote) {
    if (er) return cb(er)

    exec('git show-ref >' + nullPath + ' 2>&1 && git rev-list HEAD..' + remote, { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
      if (err) {
        if (err.message === 'stdout maxBuffer exceeded') return cb(err)
        return cb(null, NaN) // depending on the state of the git repo, the command might return non-0 exit code
      }
      stdout = stdout.trim()
      cb(null, !stdout ? 0 : parseInt(stdout.split(EOL).length, 10))
    })
  })
}

function status (repo, opts, cb) {
  opts = opts || {}
  exec('git status -s', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) return cb(err)
    const status = { dirty: 0, untracked: 0 }
    stdout.trim().split(EOL).filter(Boolean).forEach(function (file) {
      if (file.substr(0, 2) === '??') status.untracked++
      else status.dirty++
    })
    cb(null, status)
  })
}

function commit (repo, opts, cb) {
  if (typeof opts === 'function') return commit(repo, {}, opts)
  opts = opts || {}

  exec('git rev-parse --short HEAD', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) return cb(err)
    const commitHash = stdout.trim()
    cb(null, commitHash)
  })
}

function stashes (repo, opts, cb) {
  if (typeof opts === 'function') return stashes(repo, {}, opts)
  opts = opts || {}

  exec('git stash list', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) return cb(err)
    const stashes = stdout.trim().split(EOL).filter(Boolean)
    cb(null, stashes.length)
  })
}

function message (repo, opts, cb) {
  if (typeof opts === 'function') return message(repo, {}, opts)
  opts = opts || {}

  exec('git log -1 --pretty=%B', { cwd: repo, maxBuffer: opts.maxBuffer }, function (err, stdout, stderr) {
    if (err) return cb(err)
    cb(null, stdout.toString().trim())
  })
}

//* SYNC methods *//
function untrackedSync (repo, opts) {
  return statusSync(repo, opts).untracked
}

function dirtySync (repo, opts) {
  return statusSync(repo, opts).dirty
}

function branchSync (repo, opts) {
  opts = opts || {}
  try {
    const stdout = execSync('git show-ref >' + nullPath + ' 2>&1 && git rev-parse --abbrev-ref HEAD', { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
    return stdout.trim()
  } catch (err) {
    if (err.code === 'ENOBUFS') throw err
    return null // most likely the git repo doesn't have any commits yet
  }
}

function remoteBranchSync (repo, opts) {
  opts = opts || {}
  try {
    const stdout = execSync('git show-ref >' + nullPath + ' 2>&1 && git rev-parse --abbrev-ref --symbolic-full-name @{u} 2> ' + nullPath, { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
    return stdout.trim()
  } catch (err) {
    if (err.code === 'ENOBUFS') throw err
    return null // no remote or git repo doesn't have any commits yet
  }
}

function aheadSync (repo, opts) {
  opts = opts || {}
  try {
    let stdout = execSync('git show-ref >' + nullPath + ' 2>&1 && git rev-list HEAD --not --remotes', { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
    stdout = stdout.trim()
    return !stdout ? 0 : parseInt(stdout.split(EOL).length, 10)
  } catch (err) {
    if (err.code === 'ENOBUFS') throw err
    return NaN
  }
}

function behindSync (repo, opts) {
  opts = opts || {}
  try {
    const remote = remoteBranchSync(repo, opts)
    let stdout = execSync('git show-ref >' + nullPath + ' 2>&1 && git rev-list HEAD..' + remote + ' 2> ' + nullPath, { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
    stdout = stdout.trim()
    return !stdout ? 0 : parseInt(stdout.split(EOL).length, 10)
  } catch (err) {
    if (err.code === 'ENOBUFS') throw err
    return NaN
  }
}

// Throws error
function statusSync (repo, opts) {
  opts = opts || {}
  const stdout = execSync('git status -s', { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
  const status = { dirty: 0, untracked: 0 }
  stdout.trim().split(EOL).filter(Boolean).forEach(function (file) {
    if (file.substr(0, 2) === '??') status.untracked++
    else status.dirty++
  })
  return status
}

// Throws error
function commitSync (repo, opts) {
  opts = opts || {}
  const stdout = execSync('git rev-parse --short HEAD', { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
  const commitHash = stdout.trim()
  return commitHash
}

// Throws error
function stashesSync (repo, opts) {
  opts = opts || {}
  const stdout = execSync('git stash list', { cwd: repo, maxBuffer: opts.maxBuffer }).toString()
  const stashes = stdout.trim().split(EOL).filter(Boolean)
  return stashes.length
}

// Throws error
function messageSync (repo, opts) {
  opts = opts || {}
  return execSync('git log -1 --pretty=%B', { cwd: repo, maxBuffer: opts.maxBuffer }).toString().trim()
}
