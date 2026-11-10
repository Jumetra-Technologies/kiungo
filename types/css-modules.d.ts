// CSS modules, as the bundler (Vite in the desktop app, Next.js on the website) hands them over.
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
