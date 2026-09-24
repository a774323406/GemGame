// Traced from the user's 28 screenshot, independently of recognition templates.
// The 2 ends at x=231; the 8 reaches left to x=233, only two pixels away.
const close28 = [
  [[216,223],[223,223],[228,226],[229,233],[226,240],[218,246],[205,253],[231,254]],
  [[250,224],[260,219],[275,219],[278,224],[267,232],[254,242],[244,251],[234,261],
    [233,264],[246,264],[259,262],[260,259],[253,254],[246,247],[246,236],[247,226],[251,222]],
].map(stroke => stroke.map(([x, y]) => ({ x, y })));

const close28Variations = [
  ['normal', 1, 0, 0], ['narrow', 0.7, 0, 0], ['wide', 1.4, 0, 0],
  ['right lean', 1, 0.15, 0], ['left lean', 1, -0.15, 0],
  ['rising crossbar', 1, 0, -0.15], ['falling crossbar', 1, 0, 0.15],
].flatMap(([variation, width, shearX, shearY]) => [-10, -6, 0, 8].map(gapShift => ({
  name: `${variation}, gap ${gapShift}`,
  strokes: close28.map((s, digit) => s.map(p => ({
    x: (p.x - 200 + (digit ? gapShift : 0)) * width + (p.y - 220) * shearX,
    y: p.y - 220 + (p.x - 200) * shearY,
  }))),
})));

// The second report: an open 4 with a long rising crossbar, about 61×52 px.
const open4 = [
  [[219,208],[215,219],[210,230],[203,238],[219,236],[236,233],[251,230],[264,226]],
  [[234,210],[233,224],[234,243],[235,260]],
].map(stroke => stroke.map(([x, y]) => ({ x, y })));

// Traced from the reported 6+3 screenshot (8ca01b95...): a tilted, flat-bottomed
// upper loop and a nearly vertical stem. Stroke order is not present in a still.
const upright9 = [
  [[306,124],[295,119],[284,116],[277,120],[271,131],[267,141],[263,153],
    [260,164],[266,167],[274,168],[285,165],[298,160],[304,152],
    [309,138],[311,127],[309,120],[306,124]],
  [[306,124],[305,145],[303,167],[302,186],[299,206]],
].map(stroke => stroke.map(([x, y]) => ({ x, y })));

// Independently traced from 986c5d0c...png: 3+9, written as 12. The 2 has a
// narrow upper arch and a foot extending well beyond the arch's right edge.
const longFoot12 = [
  [[267,162],[270,177],[273,190],[273,200]],
  [[298,157],[302,155],[308,156],[313,159],[317,165],[320,172],
    [318,177],[313,183],[307,189],[298,195],[307,196],[323,196],[334,196]],
].map(stroke => stroke.map(([x, y]) => ({ x, y })));

const longFoot12Variations = [
  ['normal', 1, 0, 0], ['narrow', 0.7, 0, 0], ['wide', 1.4, 0, 0],
  ['right lean', 1, 0.15, 0], ['left lean', 1, -0.15, 0],
  ['rising foot', 1, 0, -0.15], ['falling foot', 1, 0, 0.15],
].flatMap(([shape, width, shearX, shearY]) => [0.8, 1, 1.3].map(foot => ({
  name: `${shape}, foot ${foot}`,
  strokes: longFoot12.map((s, digit) => s.map((p, i) => {
    const x = digit === 1 && i >= 10 ? 298 + (p.x - 298) * foot : p.x;
    return { x: (x - 267) * width + (p.y - 155) * shearX,
      y: p.y - 155 + (x - 267) * shearY };
  })),
})));

// Centerlines traced from the pre-fix phone recording 298b37... at 2s and 7s.
// These approximate the visible ink; the recording does not contain touch logs.
const phoneVideoSixes = [
  ['first six, larger round bowl', [[521,466],[503,485],[485,507],[469,530],
    [458,552],[453,572],[456,589],[467,602],[483,612],[504,616],
    [524,610],[541,596],[552,580],[556,570],[549,558],[535,551],
    [518,546],[496,543],[474,543],[447,547]]],
  ['second six after erasing, flatter bowl', [[508,473],[497,489],[487,506],
    [479,525],[473,542],[470,555],[472,575],[479,588],[492,595],
    [509,595],[526,591],[541,584],[551,576],[555,566],[551,559],
    [538,554],[522,549],[506,546],[489,545],[472,546]]],
].map(([name, points]) => ({ name, strokes: [points.map(([x, y]) => ({ x, y }))] }));

// Independently hand-entered examples. These are test data, never runtime templates.
const writingStyles = [
  ['0', 'narrow oval', [[[32,7],[16,15],[10,41],[12,74],[23,96],[39,94],[49,75],[51,40],[45,15],[32,7]]]],
  ['0', 'wide oval', [[[50,6],[21,11],[8,36],[9,69],[27,91],[60,94],[81,77],[87,48],[77,20],[50,6]]]],
  ['1', 'straight slanted stem', [[[44,8],[39,51],[33,96]]]],
  ['1', 'hook and base', [[[19,24],[40,8],[38,93]],[[18,94],[60,94]]]],
  ['2', 'rounded top', [[[13,26],[20,13],[38,7],[59,13],[67,28],[58,46],[38,64],[14,91],[70,94]]]],
  ['2', 'angular top and curved foot', [[[12,13],[46,8],[66,22],[58,45],[21,77],[10,94],[33,90],[71,94]]]],
  ['2', 'narrow arch and long foot', [[[12,15],[21,10],[30,12],[41,23],[46,36],[43,47],[28,66],[8,89],[77,90]]]],
  ['2', 'short upper hook', [[[10,9],[29,8],[40,19],[44,34],[33,51],[10,78],[4,91],[82,91]]]],
  ['2', 'separate long foot', [[[16,18],[29,9],[44,12],[58,25],[60,40],[45,61],[16,86]],[[13,91],[92,93]]]],
  ['3', 'round lobes', [[[14,14],[41,7],[64,18],[61,36],[37,49],[63,57],[69,74],[55,91],[31,95],[13,85]]]],
  ['3', 'angular top', [[[9,10],[68,10],[33,44],[58,48],[71,69],[61,89],[39,97],[13,91]]]],
  ['4', 'open sloping arm with long bar', [[[28,9],[10,61],[89,48]],[[52,11],[52,95]]]],
  ['4', 'open upright arm', [[[12,8],[11,57],[70,57]],[[53,9],[52,95]]]],
  ['4', 'closed continuous', [[[59,96],[59,8],[9,62],[78,61]]]],
  ['5', 'lifted top bar', [[[70,9],[17,10]],[[17,10],[13,49],[35,42],[61,49],[70,72],[55,91],[27,94],[12,83]]]],
  ['5', 'continuous and rounded', [[[68,10],[16,11],[13,46],[33,41],[57,47],[67,64],[64,81],[48,94],[26,96],[10,83]]]],
  ['6', 'large bowl', [[[58,7],[35,16],[16,38],[9,69],[16,88],[38,98],[61,86],[70,64],[55,49],[34,49],[14,64]]]],
  ['6', 'open curl', [[[61,8],[31,23],[13,47],[10,77],[27,95],[53,90],[65,72],[54,56],[35,57],[16,74]]]],
  ['7', 'plain', [[[12,12],[71,11],[51,48],[29,95]]]],
  ['7', 'crossed', [[[11,10],[70,11],[48,52],[27,94]],[[19,51],[60,50]]]],
  ['8', 'continuous loops', [[[38,48],[16,31],[19,15],[40,7],[60,18],[60,34],[38,48],[14,67],[15,86],[39,96],[65,82],[60,62],[38,48]]]],
  ['8', 'two loops', [[[35,48],[15,32],[16,15],[36,7],[58,17],[60,33],[35,48]],[[35,48],[12,68],[14,87],[38,97],[64,85],[62,67],[35,48]]]],
  ['9', 'loop and straight stem', [[[59,42],[39,49],[18,41],[10,24],[26,8],[48,8],[62,24],[59,94]]]],
  ['9', 'curved tail', [[[65,44],[44,53],[21,46],[11,27],[25,10],[51,8],[65,24],[66,48],[57,73],[38,95]]]],
];

module.exports = { close28, close28Variations, open4, upright9, longFoot12, longFoot12Variations, writingStyles, phoneVideoSixes };
