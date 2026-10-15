// html-validate's rules for the site (.github/workflows/check.yml). The site has no CSS at all (Lizzie's rule): layout
// is plain HTML, so the elements that do in HTML what CSS would are allowed, each below with why.
export default {
    extends: ["html-validate:recommended"],
    elements: [
        "html5",
        {
            // <center> centres without CSS. html5 lists it as deprecated, outside flow content: here it is a block
            // that holds flow content, as browsers draw it
            center: { flow: true, permittedContent: ["@flow"] },
        },
    ],
    rules: {
        // <center>: the one deprecated element allowed, for the reason above
        deprecated: ["error", { exclude: ["center"] }],
    },
};
