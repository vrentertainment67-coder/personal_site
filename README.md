# DJ VIC — Official Website

Personal website for DJ VIC, built with [Astro](https://astro.build).

---

## Running the site locally

Before you can work on the site, you need Node.js installed.
You can download it from https://nodejs.org (choose the LTS version).

Once Node.js is installed, open a terminal in this folder and run:

```sh
npm install        # download all packages (only needed the first time)
npm run dev        # start the local preview server
```

Then open your browser to **http://localhost:4321** to see the site.

To stop the server, press `Ctrl + C` in the terminal.

---

## Project structure

```
djvicofficial/
├── public/
│   └── CNAME              ← tells GitHub Pages to use djvicofficial.com
├── src/
│   ├── layouts/
│   │   └── Layout.astro   ← shared HTML shell (head, meta tags)
│   └── pages/
│       └── index.astro    ← the main page — all your content lives here
├── .github/
│   └── workflows/
│       └── deploy.yml     ← automatic deployment to GitHub Pages
├── astro.config.mjs        ← Astro configuration
└── package.json
```

---

## Deploying to GitHub Pages (step-by-step)

This is a one-time setup. After it's done, every time you push a change to GitHub the site will rebuild and go live automatically.

### Step 1 — Install Git

If you don't have Git installed, download it from https://git-scm.com and install it with the default options.

To check if it's already installed, open a terminal and run:

```sh
git --version
```

### Step 2 — Create a GitHub account

If you don't have one, go to https://github.com and sign up for a free account.

### Step 3 — Create a new repository on GitHub

1. Go to https://github.com/new
2. Set the **Repository name** to `djvicofficial` (or any name you prefer — it doesn't affect your custom domain)
3. Leave it set to **Public**
4. Do **not** check "Add a README file" (you already have one)
5. Click **Create repository**

GitHub will show you a page with setup instructions. Keep this page open — you'll need the repository URL in the next step. It looks like:

```
https://github.com/YOUR-USERNAME/djvicofficial.git
```

### Step 4 — Connect this folder to your GitHub repository

Open a terminal in the `djvicofficial` folder and run these commands one at a time:

```sh
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/djvicofficial.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username.

After `git push`, GitHub will ask for your username and password. For the password, GitHub no longer accepts your account password — you need to use a **Personal Access Token**:

1. Go to https://github.com/settings/tokens/new
2. Give it a name like "djvicofficial deploy"
3. Set expiration to "No expiration" (or 1 year)
4. Under **Scopes**, check the box for **repo**
5. Click **Generate token**
6. Copy the token — it looks like `ghp_xxxxxxxxxxxx`
7. Use this token as your password when Git prompts you

### Step 5 — Enable GitHub Pages in your repository settings

1. Go to your repository on GitHub: `https://github.com/YOUR-USERNAME/djvicofficial`
2. Click the **Settings** tab (top navigation)
3. In the left sidebar, click **Pages**
4. Under **Source**, choose **GitHub Actions**
5. Click **Save**

The site will now automatically build and deploy every time you push to `main`. You can watch the progress under the **Actions** tab.

After the first deploy, GitHub will give you a URL like:

```
https://YOUR-USERNAME.github.io/djvicofficial
```

### Step 6 — Point your custom domain to GitHub Pages

Because you already own `djvicofficial.com`, you can make GitHub Pages serve your site at that address. You'll need to update your domain's DNS settings through whatever registrar you bought the domain from (e.g. GoDaddy, Namecheap, Google Domains).

**Add these DNS records:**

| Type  | Name  | Value                 |
|-------|-------|-----------------------|
| A     | @     | 185.199.108.153       |
| A     | @     | 185.199.109.153       |
| A     | @     | 185.199.110.153       |
| A     | @     | 185.199.111.153       |
| CNAME | www   | YOUR-USERNAME.github.io |

DNS changes can take up to 24–48 hours to take effect.

**Then configure the custom domain in GitHub:**

1. Go to **Settings → Pages** in your repository
2. Under **Custom domain**, type `djvicofficial.com`
3. Click **Save**
4. Check the box for **Enforce HTTPS** once it becomes available (may take a few minutes)

The file `public/CNAME` in this project already contains `djvicofficial.com`, which tells GitHub Pages about the domain automatically on every deploy.

---

## Making changes to the site

All content is in `src/pages/index.astro`. Open that file, edit the text, save it, and then push to GitHub:

```sh
git add .
git commit -m "Update about section"
git push
```

GitHub Actions will automatically rebuild and publish the site within about a minute.

---

## Useful commands

| Command           | What it does                                    |
|-------------------|-------------------------------------------------|
| `npm install`     | Install packages (first time only)              |
| `npm run dev`     | Start local preview at http://localhost:4321    |
| `npm run build`   | Build the production site into the `dist/` folder |
| `npm run preview` | Preview the production build locally            |
