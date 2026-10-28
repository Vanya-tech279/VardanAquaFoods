/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Your existing colours, kept so nothing breaks.
      colors: {
        navy: "#0064FF",
        teal: "#008EFF",
        mist: "#FFFFFF",
        ocean: "#008EFF",
        royal: "#0064FF",
        aqua: "#00B9FF",

        // New brand scale built around your #00A8D6 / #0077B6 aqua.
        brand: {
          50: "#ECFAFF",
          100: "#D0F3FF",
          200: "#A6E7FB",
          300: "#6BD6F5",
          400: "#2BBFE6",
          500: "#00A8D6",
          600: "#0088C2",
          700: "#0077B6",
          800: "#075E8F",
          900: "#0B3B5C",
        },
        ink: "#102A43",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 28px rgba(8, 145, 178, 0.08)",
        lift: "0 22px 44px rgba(8, 145, 178, 0.16)",
        panel: "-18px 0 60px rgba(3, 37, 65, 0.16)",
      },
    },
  },
  plugins: [],
};