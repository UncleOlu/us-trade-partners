# Missing-row rule proof: St Pierre and Miquelon (1610), 2023

Snapshot: 20260909T013644Z-46e5a70d2c45

CONTRACT.md Missing-row rule: 'A missing chapter row for partner P, year Y, flow F is confirmed_zero only when the present chapter rows for P, Y, F sum exactly to the separately fetched partner total for P, Y, F. The reason cites that reconciliation.'

## imports

Partner total (imports, 2023-12, separately fetched): status=observed, value=52359

Present (observed) chapters: ['82', '90', '99']
Present chapter values: {'82': 31882, '90': 20207, '99': 270}
Sum of present chapters: 52359

Chapters confirmed_zero by reconciliation: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '78', '79', '80', '81', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98']
Reason (first example): no row; present chapters sum to partner total 52359 for 1610 imports 2023

Chapters absent: []

Chapters not_applicable (outside this flow's chapter set for 2023): []

Reconciliation: present_sum (52359) == partner_total (52359)
Result: missing chapters are confirmed_zero (reconciliation holds)

## exports

Partner total (exports, 2023-12, separately fetched): status=observed, value=139877

Present (observed) chapters: ['40', '84', '85', '87', '88', '90', '98']
Present chapter values: {'40': 2593, '84': 54295, '85': 46122, '87': 5800, '88': 7850, '90': 15400, '98': 7817}
Sum of present chapters: 139877

Chapters confirmed_zero by reconciliation: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '78', '79', '80', '81', '82', '83', '86', '89', '91', '92', '93', '94', '95', '96', '97']
Reason (first example): no row; present chapters sum to partner total 139877 for 1610 exports 2023

Chapters absent: []

Chapters not_applicable (outside this flow's chapter set for 2023): ['99']

Reconciliation: present_sum (139877) == partner_total (139877)
Result: missing chapters are confirmed_zero (reconciliation holds)

