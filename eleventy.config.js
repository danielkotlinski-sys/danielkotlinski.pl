module.exports = function (eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy("src/fonts");
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });

  // Blog collection sorted by date descending
  eleventyConfig.addCollection("blog", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/blog/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Date formatting filter (Polish)
  eleventyConfig.addFilter("dateFormat", function (date) {
    const months = [
      "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
      "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
    ];
    const d = new Date(date);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  // Excerpt filter
  eleventyConfig.addFilter("excerpt", function (content) {
    if (!content) return "";
    const text = content.replace(/<[^>]+>/g, "");
    return text.substring(0, 160) + (text.length > 160 ? "..." : "");
  });

  // Slug filter for Polish characters
  eleventyConfig.addFilter("slugify", function (str) {
    if (!str) return "";
    const polishChars = {
      ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
      ó: "o", ś: "s", ź: "z", ż: "z",
      Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N",
      Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
    };
    return str
      .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => polishChars[ch] || ch)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  });

  // Limit filter for collections
  eleventyConfig.addFilter("limit", function (arr, limit) {
    return arr.slice(0, limit);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
