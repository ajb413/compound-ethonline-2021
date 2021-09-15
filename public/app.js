async function getSelectedAccount() {
  return (await window.ethereum.request({ method: 'eth_accounts' }))[0];
}

async function isEthConnected() {
  const account = await getSelectedAccount();
  return !!account; // returns true or false
}

async function getAccountLiquidity(userAddress) {
  const chainName = Compound.util.getNetNameWithChainId(+window.ethereum.networkVersion);
  const comptrollerAddress = Compound.util.getAddress(Compound.Comptroller, chainName);
  const liquidityInUsdScaledUp = await Compound.eth.read(
    comptrollerAddress,
    'function getAccountLiquidity(address) public view returns (uint, uint, uint)',
    [ userAddress ],
    { provider: window.ethereum }
  );

  return +liquidityInUsdScaledUp[1] / 1e18;
}

async function getUnderlyingBalance(userAddress, asset) {
  const chainName = Compound.util.getNetNameWithChainId(+window.ethereum.networkVersion);
  const cTokenAddress = Compound.util.getAddress('c'+Compound[asset], chainName);
  let balance;
  try {
    balance = await Compound.eth.read(
      cTokenAddress,
      'function balanceOfUnderlying(address) returns (uint)',
      [ userAddress ],
      { provider: window.ethereum }
    );
  } catch(error) {
    console.error(error);
  }

  return +balance / Math.pow(10, Compound.decimals[asset]);
}

async function getBorrowBalance(userAddress, asset) {
  const chainName = Compound.util.getNetNameWithChainId(+window.ethereum.networkVersion);
  const cTokenAddress = Compound.util.getAddress('c'+Compound[asset], chainName);
  const balance = await Compound.eth.read(
    cTokenAddress,
    'function borrowBalanceCurrent(address account) returns (uint)',
    [ userAddress ],
    { provider: window.ethereum }
  );

  return +balance / Math.pow(10, Compound.decimals[asset]);
}

async function getAssetsIn(userAddress) {
  const chainName = Compound.util.getNetNameWithChainId(+window.ethereum.networkVersion);
  const comptrollerAddress = Compound.util.getAddress(Compound.Comptroller, chainName);
  const assetsIn = await Compound.eth.read(
    comptrollerAddress,
    'function getAssetsIn(address) view returns (address[] memory)',
    [ userAddress ],
    { provider: window.ethereum }
  );

  return assetsIn;
}

async function getPrices(assets) {
  const result = {};
  const compound = new Compound(window.ethereum);
  const priceRequests = [];

  assets.forEach((asset) => {
    priceRequests.push(compound.getPrice(asset));
  });

  const prices = await Promise.all(priceRequests);

  assets.forEach((asset, i) => {
    result[asset] = prices[i];
  });

  return result;
}

function kebabToPascalCase(string) {
  return string.replace(/-./g, x => x.toUpperCase()[1]);
}

function getDomElements(assets) {
  const result = {};
  const elements = [
    'supply-input',  // text input
    'supply-button', // button
    'borrow-input',  // text input
    'borrow-button', // button
    'supplied',      // span
    'borrowed',      // span
    'borrowable',    // span
    'collateral-checkbox', // checkbox
  ];

  assets.forEach((asset) => {
    elements.forEach((element) => {
      const selector = `${asset.toLowerCase()}-${element}`;
      result[kebabToPascalCase(selector)] = document.getElementById(selector);
    });
  });

  return result;
}

function setBorrowableAmounts(assets, elements, prices, liquidityInUsd) {
  assets.forEach((asset) => {
    elements[`${asset.toLowerCase()}Borrowable`].innerText = liquidityInUsd / prices[asset];
  });
}

async function setSuppliedAmounts(assets, elements, account) {
  const balanceRequests = [];
  assets.forEach((asset) => {
    balanceRequests.push(getUnderlyingBalance(account, asset));
  });

  const balances = await Promise.all(balanceRequests);

  assets.forEach((asset, i) => {
    elements[`${asset.toLowerCase()}Supplied`].innerText = balances[i];
  });
}

async function setBorrowBalances(assets, elements, account) {
  const balanceRequests = [];
  assets.forEach((asset) => {
    balanceRequests.push(getBorrowBalance(account, asset));
  });

  const balances = await Promise.all(balanceRequests);

  assets.forEach((asset, i) => {
    elements[`${asset.toLowerCase()}Borrowed`].innerText = balances[i];
  });
}

function setUpSupplyInterface(assets, elements) {
  assets.forEach((asset) => {
    const lower = asset.toLowerCase();
    const button = elements[`${lower}SupplyButton`];
    const input = elements[`${lower}SupplyInput`];
    button.onclick = async () => {
      const amount = +input.value;
      await supply(Compound[asset], amount);
    };
  });
}

function setUpBorrowInterface(assets, elements) {
  assets.forEach((asset) => {
    const lower = asset.toLowerCase();
    const button = elements[`${lower}BorrowButton`];
    const input = elements[`${lower}BorrowInput`];
    button.onclick = async () => {
      const amount = +input.value;
      await borrow(Compound[asset], amount);
    };
  });
}

function setUpCollateralInterface(assets, assetsIn, elements) {
  const chainName = Compound.util.getNetNameWithChainId(+window.ethereum.networkVersion);

  assets.forEach((asset) => {
    const lower = asset.toLowerCase();
    const checkbox = elements[`${lower}CollateralCheckbox`];

    const cTokenAddress = Compound.util.getAddress('c'+Compound[asset], chainName);
    if (assetsIn.indexOf(cTokenAddress) !== -1) {
      checkbox.checked = true;
    }

    checkbox.onclick = async (event) => {
      const isCollateral = event.srcElement.checked;
      await markCollateral(Compound[asset], isCollateral);
    };
  });
}

async function supply(asset, amount) {
  if (!isNaN(amount) && amount !== 0) {
    const compound = new Compound(window.ethereum);
    try {
      const trx = await compound.supply(asset, amount, { chainId: +window.ethereum.chainId });
      console.log(asset, 'Supply', amount, trx);
      console.log('Transaction Hash', trx.hash);
    } catch (err) {
      console.error(err);
      alert(JSON.stringify(err));
    }
  }
}

async function borrow(asset, amount) {
  if (!isNaN(amount) && amount !== 0) {
    const compound = new Compound(window.ethereum);
    try {
      const trx = await compound.borrow(asset, amount);
      console.log(asset, 'Borrow', amount, trx);
      console.log('Transaction Hash', trx.hash);
    } catch (err) {
      console.error(err);
      alert(JSON.stringify(err));
    }
  }
}

async function markCollateral(asset, isCollateral) {
  const compound = new Compound(window.ethereum);
  try {
    let trx;
    if (isCollateral) {
      trx = await compound.enterMarkets(asset);
      console.log(asset, 'enterMarkets', trx);
    } else {
      trx = await compound.exitMarket(asset);
      console.log(asset, 'exitMarket', trx);
    }
    console.log('Transaction Hash', trx.hash);
  } catch (err) {
    console.error(err);
    alert(JSON.stringify(err));
  }
}

window.onload = async function () {
  const enableButton = document.getElementById('enable-button');

  if (typeof window.ethereum === 'undefined') {
    alert('Metamask not detected. Install it at metamask.io');
  } else {
    const connectedLoop = setInterval(async () => {
      const isConnected = await isEthConnected();
      if (isConnected) {
        clearInterval(connectedLoop);
        main();
      }
    }, 500);

    enableButton.onclick = async () => {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
    };
  }
}

async function main() {
  const assets = [ 'ETH', 'USDC', 'UNI' ]; // make sure these are all upper case
  const elements = getDomElements(assets);
  const prices = await getPrices(assets);

  let account = await getSelectedAccount();
  console.log('account', account);

  const liquidityInUsd = await getAccountLiquidity(account);

  setBorrowableAmounts(assets, elements, prices, liquidityInUsd);
  setSuppliedAmounts(assets, elements, account);
  setBorrowBalances(assets, elements, account);
  setUpSupplyInterface(assets, elements);
  setUpBorrowInterface(assets, elements);

  const assetsIn = await getAssetsIn(account);
  setUpCollateralInterface(assets, assetsIn, elements);
}
