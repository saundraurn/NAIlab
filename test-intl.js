const fmtNum = n => new Intl.NumberFormat('en',{notation:'compact'}).format(n||0).toLowerCase();
console.log(fmtNum(1500));
console.log(fmtNum(1500000));
console.log(fmtNum(0));
console.log(fmtNum(12));
