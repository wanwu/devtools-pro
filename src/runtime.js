const $devtools = (self.$devtools = {});

export default function createRuntime(chobitsu) {
    $devtools.registerMethod = chobitsu.registerMethod;
    $devtools.trigger = chobitsu.trigger;
}
