function updateVisualElements() {
  let headerContainer = $("header>.container");

  if (headerContainer.length === 0) return;

  let navBarHeight = $("#main-nav").height();
  let headerHeight = $("header").height();

  headerContainer.css({ "margin-top": navBarHeight + 32 + "px" });

  let scroll = $(window).scrollTop();

  if (scroll >= headerHeight - navBarHeight) {
    $("#main-nav").removeClass("navbar-bg-translucide").addClass("navbar-bg-opaque");
  } else {
    $("#main-nav").removeClass("navbar-bg-opaque").addClass("navbar-bg-translucide");
  }
}

$(document).ready(function () {
  $("pre code").each(function (i, block) {
    hljs.configure({ languages: [] });
    hljs.highlightBlock(block);
  });

  updateVisualElements();
});

$(document).on("mouseover", ".lottie", function () {
  $(this).find(document.getElementsByTagName("lottie-player"))[0].play();
});

$(document).on("mouseleave", ".lottie", function () {
  $(this).find(document.getElementsByTagName("lottie-player"))[0].stop();
});

$(window).resize(function () {
  updateVisualElements();
});

$(window).scroll(function () {
  updateVisualElements();
});
