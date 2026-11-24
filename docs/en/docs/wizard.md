# Install HESARI OS

Use the [installation instructions](https://github.com/mjhesari/Hesari-Os#install)
and this fork’s own worker build. Each user configures their own Cloudflare
account, credentials and KV namespace. `npm run dev` runs the actual Worker
locally, and `npm run deploy` deploys it to Workers.

The BPB Wizard instructions below describe the original installer. Its default
source installs upstream BPB, so use this fork’s configured output to retain
HESARI OS. The embedded settings format stays compatible with BPB.

## Original BPB installer reference

# :material-new-box:{ .md .middle } BPB Wizard

To simplify the setup process and prevent user mistakes during installation, the [BPB Wizard](https://github.com/bia-pain-bache/BPB-Wizard) project was launched which provides online and CLI installations. It supports both Workers and Pages methods and just takes a few seconds to install panel!

<p align="center" class="img-wrapper">
  <img src="/BPB-Worker-Panel/images/wizard-web.jpg" width="400" alt="wizard-web" />
  <img src="/BPB-Worker-Panel/images/wizard-cli.jpg" width="400" alt="wizard-cli" />
</p>

## 1. Cloudflare account

To use this method, all you need is a Cloudflare account. You can [sign up here](https://dash.cloudflare.com/sign-up/), and don’t forget to check your email afterward to verify your account.

## 2. Install HESARI OS

### Web edition

This is a ready to use edition and provides a `Private Link` after first installation which enables `ONE-CLICK` installation on your account.

To easily install the latest stable version of HESARI OS online:

```url title="Web installation"
https://wizard.bpb-panel.workers.dev
```

### CLI edition

```bash title="Windows PowerShell"
irm https://raw.githubusercontent.com/bia-pain-bache/BPB-Wizard/main/install.ps1 | iex
```

```bash title="Android (Termux) - Linux - macOS"
bash <(curl -fsSL https://raw.githubusercontent.com/bia-pain-bache/BPB-Wizard/main/install.sh)
```

!!! warning "Termux usage attention"
    Be sure to download and install Termux only from its [official source](https://github.com/termux/termux-app/releases/latest). Installing via Google Play might cause issues. Also if you're connected to a VPN, disconnect it first.
