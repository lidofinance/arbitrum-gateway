import { StandardBridgeAdapter, toAddress } from "@eth-optimism/sdk";
import { hexStringEquals } from "@eth-optimism/core-utils";
import { Contract } from 'ethers';

export class LidoBridgeAdapter extends StandardBridgeAdapter {
    async supportsTokenPair(l1Token: Contract, l2Token: Contract) {
        const l1Bridge = new Contract(this.l1Bridge.address, [
            {
                inputs: [],
                name: 'L1_TOKEN_NON_REBASABLE',
                outputs: [
                    {
                        internalType: 'address',
                        name: '',
                        type: 'address',
                    },
                ],
                stateMutability: 'view',
                type: 'function',
            },
            {
                inputs: [],
                name: 'L2_TOKEN_NON_REBASABLE',
                outputs: [
                    {
                        internalType: 'address',
                        name: '',
                        type: 'address',
                    },
                ],
                stateMutability: 'view',
                type: 'function',
            },
            {
                inputs: [],
                name: 'L1_TOKEN_REBASABLE',
                outputs: [
                    {
                        internalType: 'address',
                        name: '',
                        type: 'address',
                    },
                ],
                stateMutability: 'view',
                type: 'function',
            },
            {
                inputs: [],
                name: 'L2_TOKEN_REBASABLE',
                outputs: [
                    {
                        internalType: 'address',
                        name: '',
                        type: 'address',
                    },
                ],
                stateMutability: 'view',
                type: 'function',
            },
        ], this.messenger.l1Provider);

        const allowedL1RebasableToken = await l1Bridge.L1_TOKEN_REBASABLE();
        const allowedL1NonRebasableToken = await l1Bridge.L1_TOKEN_NON_REBASABLE();

        if ((!(0, hexStringEquals)(allowedL1RebasableToken, (0, toAddress)(l1Token))) &&
            (!(0, hexStringEquals)(allowedL1NonRebasableToken, (0, toAddress)(l1Token))))
        {
            return false;
        }

        const allowedL2RebasableToken = await l1Bridge.L2_TOKEN_REBASABLE();
        const allowedL2NonRebasableToken = await l1Bridge.L2_TOKEN_NON_REBASABLE();

        if ((!(0, hexStringEquals)(allowedL2RebasableToken, (0, toAddress)(l2Token))) &&
            (!(0, hexStringEquals)(allowedL2NonRebasableToken, (0, toAddress)(l2Token)))) {
            return false;
        }
        return true;
    }
}
