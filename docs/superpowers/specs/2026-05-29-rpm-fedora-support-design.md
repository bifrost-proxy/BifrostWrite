# RPM/Fedora Support for BifrostWrite Desktop

## Problem

BifrostWrite desktop publishes `.deb` packages and hosts an APT repository for
Ubuntu/Debian users, but has no support for Fedora/RHEL users who need `.rpm`
packages.

## Scope

Add full Fedora/RHEL support to the BifrostWrite release pipeline:

1. Build `.rpm` packages for `x86_64` and `aarch64` architectures
2. Publish RPMs as GitHub Release assets
3. Host a DNF repository on `gh-pages` with signed metadata
4. Validate RPM packages and DNF repo metadata in CI

## Design

### Package naming

Same convention as the Debian packages, using RPM architecture names:

- `BifrostWrite-{version}-x86_64.rpm` (amd64 host)
- `BifrostWrite-{version}-aarch64.rpm` (arm64 host)

No distribution tag (`.fc40`, `.el10`) for cross-distro compatibility.

### DNF repository layout on `gh-pages`

Only metadata is stored on `gh-pages` — RPM binaries stay on GitHub Releases,
mirroring the APT "remote packages" pattern:

```
dnf/
  neverwrite-archive-keyring.asc
  neverwrite.repo.example
  repodata/
    repomd.xml
    repomd.xml.asc
    primary.xml.gz
    filelists.xml.gz
    other.xml.gz
```

The `<location href>` in `primary.xml` for each package is an absolute GitHub
Release download URL:
```
https://github.com/jsgrrchg/BifrostWrite/releases/download/vX.Y.Z/BifrostWrite-X.Y.Z-x86_64.rpm
```

### User repository configuration

```ini
[neverwrite]
name=BifrostWrite
baseurl=https://jsgrrchg.github.io/BifrostWrite/dnf
enabled=1
gpgcheck=1
gpgkey=https://jsgrrchg.github.io/BifrostWrite/dnf/neverwrite-archive-keyring.asc
```

### GPG signing

The DNF repository uses the same GPG signing key (`APT_REPO_GPG_PRIVATE_KEY`)
as the APT repository. The detached signature is `repomd.xml.asc`.

### Implementation plan

See implementation-plan.md for the detailed step-by-step breakdown.
